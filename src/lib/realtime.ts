// Supabase Realtime → automatic pull-on-change.
//
// We subscribe to WAL-streamed postgres_changes on every table the app
// syncs. RLS is enforced per subscriber, so we only receive events for rows
// we could SELECT (i.e. owned + shared rows). On any event, we schedule a
// coalesced pull-and-merge into Dexie.
//
// Why coalesce: a burst of edits (e.g. another device syncing 10 items)
// would otherwise trigger 10 pulls. We collapse them into one pull on a
// short timer.
//
// Why pull-everything: simpler than parsing each event's payload and
// applying it surgically. Pull is cheap (the largest tables are filtered by
// user_id at the server). If the row count ever grows large this is the
// first thing to optimize.
//
// v1.2.1 — AUDIT-FSG-5 hardening:
//   1. Per-subscription `filter: user_id=eq.<uid>` on every table that does
//      NOT have a sharing surface. RLS is still the security boundary (the
//      filter is server-side and defense-in-depth, not the only gate), but
//      it cuts WAL bandwidth dramatically and means a future RLS regression
//      on these tables can't quietly leak rows. Sharing-aware tables
//      (`budget_categories`, `tasks`, plus the share tables themselves)
//      stay unfiltered so rows shared TO the current user still reach the
//      subscription — RLS handles those correctly already.
//   2. Added the v1.2 tables that the previous TABLES list missed:
//      `habits`, `habit_completions`, `body_metrics`. Without them, cross-
//      device or sibling-app edits to habits / body metrics never reach
//      NCC until manual refresh.

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useSyncStore } from '../store/useSyncStore';

// Tables that scope per-user. These get the `user_id=eq.<uid>` filter so
// only the current user's WAL events reach NCC. (RLS does the same thing
// post-broadcast anyway — this is the defense-in-depth + bandwidth fix.)
const USER_SCOPED_TABLES = [
  'transactions',
  'portfolio_holdings',
  'subjects',
  'grades',
  'workout_sessions',
  'workout_sets',
  // v2-B
  'study_sessions',
  // v2-D
  'portfolio_lots',
  // v3
  'manual_assets',
  'watchlist_items',
  // v3-Phase5
  'goals',
  // v1.2 — missing from the pre-AUDIT-FSG-5 TABLES list, now wired so
  // cross-device habit + body-metric edits reach NCC in realtime.
  'habits',
  'habit_completions',
  'body_metrics',
] as const;

// Tables that intentionally surface rows BEYOND the current user (sharing).
// `budget_categories` and `tasks` can carry rows owned by another user when
// that user granted the current user a share — adding a `user_id=eq.<uid>`
// filter would suppress those events. The share-link tables (`*_shares`)
// have the same property by design. Leave these unfiltered; RLS handles
// scope correctly.
const SHARING_AWARE_TABLES = [
  'budget_categories',
  'budget_category_shares',
  'tasks',
  'task_shares',
] as const;

let channel: RealtimeChannel | null = null;
let pullTimer: ReturnType<typeof setTimeout> | null = null;
const COALESCE_MS = 1500;

function schedulePull() {
  if (pullTimer) return;
  pullTimer = setTimeout(() => {
    pullTimer = null;
    // syncNow is idempotent + serializes via the inflight promise chain, so
    // we don't have to worry about overlapping with the user's manual taps
    // or the background flusher.
    void useSyncStore.getState().syncNow();
  }, COALESCE_MS);
}

/**
 * Open the realtime channel.
 *
 * @param userId - The current signed-in user's auth.uid(). Used to scope
 *   user-scoped table subscriptions. Sharing-aware tables ignore it.
 */
export function startRealtime(userId: string): void {
  // Already subscribed — keep it.
  if (channel) return;
  const c = supabase.channel('nexus-sync');
  for (const table of USER_SCOPED_TABLES) {
    c.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'postgres_changes' as any,
      { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      () => schedulePull()
    );
  }
  for (const table of SHARING_AWARE_TABLES) {
    c.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'postgres_changes' as any,
      { event: '*', schema: 'public', table },
      () => schedulePull()
    );
  }
  c.subscribe();
  channel = c;
}

export function stopRealtime(): void {
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  if (pullTimer) {
    clearTimeout(pullTimer);
    pullTimer = null;
  }
}
