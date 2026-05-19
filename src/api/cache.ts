// Three-layer fetch protection:
//
// 1. Per-request cache TTL (readCache/writeCache). Each fetcher has its own
//    cache key + TTL. This is the standard "don't re-fetch if we already
//    have fresh data" gate.
//
// 2. Soft-refresh interval. Even when the caller passes `force: true` (e.g.
//    the user clicks ↻), we won't actually hit the network if our last
//    successful call to that bucket-and-key was within the soft interval.
//    Cheap protection against double-taps and overzealous "let me try again"
//    behavior. Each fetcher declares its own interval — quotes: 60s,
//    profiles: 7d, news: 6h, etc.
//
// 3. Daily call budget per provider. localStorage-backed. Once exceeded,
//    fetchers return cached data only and log "Daily budget exceeded".
//    Resets at local midnight. This is the safety net against runaway
//    refresh loops accidentally burning your whole 60/min budget on day 1
//    of debugging something.

import { db } from '../db/database';

const TTL_MS = 60 * 60 * 1000; // default 60 min when caller doesn't specify

export interface CacheRead<T> {
  data: T;
  fetchedAt: Date;
  ageMinutes: number;
  fresh: boolean;
}

export async function readCache<T>(key: string): Promise<CacheRead<T> | null> {
  const entry = await db.apiCache.get(key);
  if (!entry) return null;
  const fetchedAt = new Date(entry.fetchedAt);
  const ageMs = Date.now() - fetchedAt.getTime();
  return {
    data: JSON.parse(entry.data) as T,
    fetchedAt,
    ageMinutes: Math.floor(ageMs / 60000),
    fresh: ageMs < TTL_MS,
  };
}

export async function writeCache(key: string, data: unknown): Promise<void> {
  const now = new Date();
  await db.apiCache.put({
    cacheKey: key,
    data: JSON.stringify(data),
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  });
}

// ── Layer 2 + Layer 3: rate budget + soft-refresh ─────────────────────────

// Per-bucket call timestamps for the 60s rolling-window check (legacy use).
const callTimestamps: Record<string, number[]> = {};

// Per-bucket "last successful fetch" timestamp for soft-refresh gating. Keyed
// by `${bucket}|${optionalSubKey}` so e.g. yahoo per-ticker can be tracked
// independently if we ever care to.
const lastFetchAt: Record<string, number> = {};

// Per-bucket configurable soft-refresh interval. Defaults to 60s for quote
// buckets, 30 min for everything else — adjust via setSoftInterval.
const softIntervalMs: Record<string, number> = {
  finnhub: 60_000,        // quote endpoint
  yahoo: 60_000,           // quote endpoint
  coingecko: 60_000,       // simple/markets
  'finnhub-profile': 7 * 24 * 60 * 60_000,   // 7d
  'finnhub-metric': 24 * 60 * 60_000,         // 24h
  'finnhub-rec': 24 * 60 * 60_000,            // 24h
  'finnhub-news': 6 * 60 * 60_000,            // 6h
  'finnhub-earnings': 12 * 60 * 60_000,       // 12h
  'finnhub-div': 7 * 24 * 60 * 60_000,        // 7d
  'yahoo-spark': 6 * 60 * 60_000,             // 6h
  'yahoo-summary': 24 * 60 * 60_000,          // 24h international fallback
};

export function setSoftInterval(bucket: string, ms: number): void {
  softIntervalMs[bucket] = ms;
}

// Daily budget per provider (keyed in localStorage by `apibudget_${provider}_${YYYY-MM-DD}`).
// Default caps are generous: enough for ~10 holdings × 5 refresh-types × a few refreshes/day,
// but tight enough that a runaway loop trips them within minutes instead of hours.
const dailyBudget: Record<string, number> = {
  finnhub: 250,
  yahoo: 500, // unofficial, no published limit, but we throttle ourselves
  coingecko: 200,
};

export function setDailyBudget(provider: string, n: number): void {
  dailyBudget[provider] = n;
}

function todayKey(): string {
  // Local date so the budget resets at the user's local midnight, not UTC.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function budgetStorageKey(provider: string): string {
  return `apibudget_${provider}_${todayKey()}`;
}

export function dailyBudgetUsed(provider: string): number {
  try {
    return parseInt(localStorage.getItem(budgetStorageKey(provider)) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function dailyBudgetRemaining(provider: string): number {
  return Math.max(0, (dailyBudget[provider] ?? 9999) - dailyBudgetUsed(provider));
}

// Legacy per-minute sliding-window check — still used as a hard cap for the
// "calls per minute" budget some providers enforce server-side.
export function underRateLimit(bucket: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const stamps = (callTimestamps[bucket] ??= []);
  while (stamps.length && now - stamps[0] > windowMs) stamps.shift();
  return stamps.length < maxPerMinute;
}

// Should we call the network for this bucket right now? Combines:
//   - daily budget remaining
//   - soft-refresh interval since last successful call
//   - per-minute legacy cap (if caller passes one)
// Pass `force: true` to ignore the soft interval (but daily budget + per-min
// still apply — those are hard caps).
export function shouldFetch(
  bucket: string,
  provider: string,
  opts: { force?: boolean; maxPerMinute?: number; subKey?: string } = {},
): { allow: boolean; reason?: string } {
  if (dailyBudgetRemaining(provider) <= 0) {
    return { allow: false, reason: `${provider} daily budget exhausted` };
  }
  if (opts.maxPerMinute && !underRateLimit(bucket, opts.maxPerMinute)) {
    return { allow: false, reason: `${bucket} per-minute cap reached` };
  }
  if (!opts.force) {
    const key = opts.subKey ? `${bucket}|${opts.subKey}` : bucket;
    const last = lastFetchAt[key] ?? 0;
    const interval = softIntervalMs[bucket] ?? 30 * 60_000;
    if (Date.now() - last < interval) {
      return { allow: false, reason: `${bucket} within soft-refresh interval` };
    }
  }
  return { allow: true };
}

// Auto-derive provider from bucket so legacy callers (recordCall('finnhub'))
// still feed the daily-budget counter without code changes.
function providerForBucket(bucket: string): string {
  if (bucket === 'finnhub' || bucket.startsWith('finnhub-')) return 'finnhub';
  if (bucket === 'yahoo' || bucket.startsWith('yahoo-')) return 'yahoo';
  if (bucket === 'coingecko' || bucket.startsWith('coingecko-')) return 'coingecko';
  return bucket;
}

export function recordCall(bucket: string, provider?: string, subKey?: string): void {
  const now = Date.now();
  (callTimestamps[bucket] ??= []).push(now);
  const key = subKey ? `${bucket}|${subKey}` : bucket;
  lastFetchAt[key] = now;
  const p = provider ?? providerForBucket(bucket);
  try {
    const k = budgetStorageKey(p);
    const n = (parseInt(localStorage.getItem(k) ?? '0', 10) || 0) + 1;
    localStorage.setItem(k, String(n));
  } catch {
    /* localStorage unavailable in some environments — degrade gracefully */
  }
}

// Used by UI to render a "Finnhub: 23/250 today" usage badge.
export interface BudgetStats {
  provider: string;
  used: number;
  max: number;
}

export function allBudgetStats(): BudgetStats[] {
  return Object.entries(dailyBudget).map(([provider, max]) => ({
    provider,
    used: dailyBudgetUsed(provider),
    max,
  }));
}
