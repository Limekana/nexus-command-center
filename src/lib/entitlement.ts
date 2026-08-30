// Supporter entitlement — reads `supporter_entitlements` for the signed-in
// user and answers one question: is a paid perk unlocked right now?
//
// The table is written *only* by the verified Ko-fi webhook Edge Function.
// RLS grants `select` on your own row and nothing else — there is no client
// insert/update path at all, so this module is a pure reader. Same contract
// and same storage shape as StudyDesk's and LimeLog's copies; kept per-app
// rather than as a shared package because the three apps have no shared build
// and each ships to F-Droid independently.
//
// Why `expires_at` and not an `active` boolean: Ko-fi's webhook fires on
// payment events only. There is no cancellation event, so a boolean could be
// set true and could never be set back. Each payment instead pushes
// `expires_at` out by a fixed window; lapsing is the absence of a renewal
// rather than an event we have to be told about.
//
// Honest scope note: this is a cosmetic perk in an open-source, client-only
// app. The theme CSS ships to everyone and the app is on F-Droid with
// published source, so nothing here is — or can be — an enforcement boundary.
// It exists so a supporter's perk switches on by itself, keeps working
// offline, and lapses correctly.

import { supabase } from './supabase';

const CACHE_KEY = 'nexus.entitlement';

// Short enough that a fresh supporter sees their perk the same session, long
// enough that opening the app offline for a week doesn't strip a paid theme.
const REVALIDATE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

interface EntitlementRecord {
  userId: string;
  tier: string | null;
  expiresAt: string | null;
  lifetime?: boolean;
  checkedAt: number;
}

/**
 * Read the cached record without touching the network. Safe to call during the
 * synchronous pre-mount pass in main.tsx.
 */
export function readCachedEntitlement(): EntitlementRecord | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as EntitlementRecord;
    return rec && typeof rec === 'object' ? rec : null;
  } catch {
    return null;
  }
}

/**
 * True when the cached record is present and its window has not closed. An
 * absent, malformed or expired record all answer the same way: false.
 */
export function isEntitled(now: number = Date.now()): boolean {
  const rec = readCachedEntitlement();
  if (!rec) return false;
  // v1.12 Item 6a — a lifetime grant outranks the clock entirely. The webhook
  // upserts an explicit column list that excludes `lifetime`, so a later
  // membership payment moves expires_at without disturbing a manual grant;
  // checking the flag first is what makes that survive.
  if (rec.lifetime) return true;
  if (!rec.expiresAt) return false;
  const expires = Date.parse(rec.expiresAt);
  return Number.isNaN(expires) ? false : expires > now;
}

function writeCache(rec: EntitlementRecord | null): void {
  try {
    if (rec) localStorage.setItem(CACHE_KEY, JSON.stringify(rec));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage unavailable — fall through to the un-entitled default */
  }
}

/**
 * Called on sign-out. Leaving a previous account's entitlement behind on a
 * shared device would hand the next user a paid theme.
 */
export function clearEntitlement(): void {
  writeCache(null);
}

let inFlight: Promise<boolean> | null = null;

/**
 * Ask the server. Never throws — a network failure keeps whatever was cached,
 * because dropping a supporter's theme because their train went into a tunnel
 * is the wrong failure mode.
 */
export async function refreshEntitlement(
  userId: string | null | undefined,
  { force = false }: { force?: boolean } = {},
): Promise<boolean> {
  if (!userId) {
    clearEntitlement();
    return false;
  }

  const cached = readCachedEntitlement();
  if (
    !force &&
    cached &&
    cached.userId === userId &&
    Date.now() - (cached.checkedAt || 0) < REVALIDATE_AFTER_MS
  ) {
    return isEntitled();
  }

  // Collapse concurrent callers onto one request rather than racing two
  // writes into the same cache key.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('supporter_entitlements')
        .select('tier, expires_at, lifetime')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) return isEntitled(); // includes offline — keep the cache

      if (!data) {
        // Authoritative "no row": this user has never supported. Clearing is
        // correct here; it is not a failure.
        writeCache({ userId, tier: null, expiresAt: null, lifetime: false, checkedAt: Date.now() });
        return false;
      }

      writeCache({
        userId,
        tier: (data as { tier?: string }).tier ?? null,
        expiresAt: (data as { expires_at?: string }).expires_at ?? null,
        lifetime: (data as { lifetime?: boolean }).lifetime === true,
        checkedAt: Date.now(),
      });
      return isEntitled();
    } catch {
      return isEntitled();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
