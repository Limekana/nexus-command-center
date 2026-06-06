// ─── v1.2 Insights three-tier cache architecture ─────────────────────────
//
// The rate-limit discipline behind the Insights feature. Three tiers,
// chosen so the data freshness matches how fast the underlying inputs
// actually change AND so neither Finnhub (free tier 60/min) nor Yahoo
// (informal limits, hostile when slammed) ever sees more requests than
// strictly necessary regardless of watchlist size.
//
//   TIER_WEEKLY_MS  — Fundamentals (P/E, P/B, P/S, debt/equity, revenue
//                     growth, earnings history, analyst consensus). The
//                     fields move at quarterly cadence at best — caching
//                     a full week is conservative and still always
//                     "fresh enough" to differentiate Buy from Hold.
//   TIER_DAILY_MS   — Technicals (RSI, SMA, momentum, volume, news
//                     sentiment). Tick at end-of-day; computing once per
//                     calendar day per holding in a single batched pass
//                     is exactly the right rhythm.
//   TIER_ONOPEN_MS  — Live price + intraday change. Refreshes whenever
//                     the user opens the app + on the existing 20-min
//                     resume tick.
//
// Sweep guards:
//   The store-level recompute functions gate themselves on a "last sweep"
//   timestamp in localStorage so multiple cold-starts within the same
//   tier window short-circuit without re-running the batched pass even
//   though the Dexie cache would have served everything anyway. The
//   short-circuit saves the linear iteration cost (a 15-ticker
//   `recomputeAll` is ~12s worst-case even when fully cached because
//   each pass still re-runs the signal math).

// ── Tier durations ────────────────────────────────────────────────────────

export const TIER_WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;
export const TIER_DAILY_MS  = 24 * 60 * 60 * 1000;
/** "On open" isn't strictly a Dexie cache value — quotes refresh via the
 *  existing portfolio refresh flow (60s soft floor + 20min resume tick).
 *  Exposed here for documentation symmetry. */
export const TIER_ONOPEN_MS = 60 * 1000;

// ── Sweep timestamps (localStorage) ───────────────────────────────────────
//
// Calling Insights.recomputeAll() on every app-open is wasteful even when
// the Dexie cache hits — the JS-side signal math still iterates per ticker.
// We track the last completed sweep per tier and skip the iteration when
// the tier window hasn't elapsed.
//
// localStorage keeps the timestamps surviving cold-starts. We persist as
// ISO strings rather than millis so post-mortems can read them.

const TECHNICAL_SWEEP_KEY = 'insights.lastTechnicalSweep';
const FUNDAMENTAL_SWEEP_KEY = 'insights.lastFundamentalSweep';

function readTimestamp(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const t = Date.parse(raw);
    return isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

function writeTimestamp(key: string, when: Date = new Date()): void {
  try {
    localStorage.setItem(key, when.toISOString());
  } catch {
    // Quota / private-mode failures — non-fatal. We'll re-sweep on the next
    // app open which is the correct behaviour for a missed write anyway.
  }
}

/** True when the technical sweep hasn't run in the past TIER_DAILY_MS.
 *  Pass `force=true` (e.g. from a user-triggered manual refresh) to bypass. */
export function shouldRunDailyTechnicalSweep(force: boolean = false): boolean {
  if (force) return true;
  const last = readTimestamp(TECHNICAL_SWEEP_KEY);
  if (last == null) return true;
  return Date.now() - last > TIER_DAILY_MS;
}

export function markDailyTechnicalSweep(): void {
  writeTimestamp(TECHNICAL_SWEEP_KEY);
}

/** True when the fundamental sweep hasn't run in the past TIER_WEEKLY_MS. */
export function shouldRunWeeklyFundamentalSweep(force: boolean = false): boolean {
  if (force) return true;
  const last = readTimestamp(FUNDAMENTAL_SWEEP_KEY);
  if (last == null) return true;
  return Date.now() - last > TIER_WEEKLY_MS;
}

export function markWeeklyFundamentalSweep(): void {
  writeTimestamp(FUNDAMENTAL_SWEEP_KEY);
}

/** Telemetry — surfaced in the diagnostic panel + the Insights screen header
 *  so the user can see "your last sweep was X hours ago". */
export function lastSweepTimestamps(): {
  technical: string | null;
  fundamental: string | null;
} {
  return {
    technical: localStorage.getItem(TECHNICAL_SWEEP_KEY),
    fundamental: localStorage.getItem(FUNDAMENTAL_SWEEP_KEY),
  };
}

// ── BUG-9 — Composite-rating disk persistence ────────────────────────────
//
// The tier guards above tell the recompute pipeline "you don't need to
// re-iterate the signal math right now" — but the in-memory `ratings`
// and `fundamentals` maps in useInsightsStore are empty on cold start, so
// without a separate disk-backed restore path the UI shows blank pills until
// the sweep window expires (24h technical, 7d fundamental). That was the
// BUG-9 symptom.
//
// Fix: every successful per-ticker compute upserts one row into the new
// `insightsScores` Dexie table (one row per ticker+kind). On cold start
// the store calls `hydrateInsightScores()` BEFORE the cold-start refresh
// effect kicks the recompute pipelines, so the gate flow becomes:
//   1. hydrate maps from disk → ratings show immediately
//   2. sweep guard fires → if within window, no-op (hydrated data is the
//      latest correct snapshot); if window expired, recompute overwrites.

import { db, type InsightScoreRow } from '../db/database';
import type { CompositeRating, CompositeBreakdown, InsightTier } from './insightsScore';
import type { FundamentalRating, FundamentalBreakdown } from './fundamentalsScore';

export type InsightKind = 'technical' | 'fundamental';

/** Upsert one rating to disk. Fire-and-forget — failures log but don't
 *  block the compute pipeline. Idempotent via put() on the synthesised PK. */
export async function saveInsightScore(
  kind: InsightKind,
  rating: CompositeRating | FundamentalRating,
): Promise<void> {
  try {
    await db.insightsScores.put({
      id: `${kind}:${rating.ticker.toUpperCase()}`,
      ticker: rating.ticker.toUpperCase(),
      kind,
      score: rating.score,
      tier: rating.tier,
      partial: rating.partial,
      breakdownJson: JSON.stringify(rating.breakdown),
      computedAt: rating.computedAt,
    });
  } catch (e) {
    // Quota exhaustion / private-mode IndexedDB blocks etc. Non-fatal — the
    // in-memory map is still correct for this session; we'll retry the
    // persistence on the next recompute. Cold-start hydration just won't
    // find a row for this ticker and the UI shows the "—" placeholder
    // until the daily/weekly sweep window opens.
    console.warn('[insights] saveInsightScore failed for', rating.ticker, e);
  }
}

/** Pull every persisted rating into the shape the store expects. Called once
 *  on cold start from useInsightsStore.hydrate(). Resilient: a single bad
 *  row (corrupted JSON, missing fields) is skipped, not propagated.  */
export async function hydrateInsightScores(): Promise<{
  ratings: Record<string, CompositeRating>;
  fundamentals: Record<string, FundamentalRating>;
}> {
  const ratings: Record<string, CompositeRating> = {};
  const fundamentals: Record<string, FundamentalRating> = {};
  let rows: InsightScoreRow[];
  try {
    rows = await db.insightsScores.toArray();
  } catch (e) {
    console.warn('[insights] hydrateInsightScores failed to read', e);
    return { ratings, fundamentals };
  }
  for (const r of rows) {
    let breakdown: unknown;
    try {
      breakdown = JSON.parse(r.breakdownJson);
    } catch {
      // Corrupt blob — skip this row. The next compute will overwrite.
      continue;
    }
    const tier = r.tier as InsightTier;
    if (r.kind === 'technical') {
      ratings[r.ticker] = {
        ticker: r.ticker,
        score: r.score,
        tier,
        breakdown: breakdown as CompositeBreakdown,
        computedAt: r.computedAt,
        partial: r.partial,
      };
    } else if (r.kind === 'fundamental') {
      fundamentals[r.ticker] = {
        ticker: r.ticker,
        score: r.score,
        tier,
        breakdown: breakdown as FundamentalBreakdown,
        computedAt: r.computedAt,
        partial: r.partial,
      };
    }
  }
  return { ratings, fundamentals };
}
