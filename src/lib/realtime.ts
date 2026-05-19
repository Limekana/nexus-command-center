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

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useSyncStore } from '../store/useSyncStore';

const TABLES = [
  'transactions',
  'budget_categories',
  'budget_category_shares',
  'portfolio_holdings',
  'subjects',
  'grades',
  'workout_sessions',
  'workout_sets',
  'tasks',
  'task_shares',
  // v2-B
  'study_sessions',
  'readings',
  // v2-D
  'portfolio_lots',
  // v3
  'manual_assets',
  'watchlist_items',
  // v3-Phase5
  'goals',
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

export function startRealtime(): void {
  // Already subscribed — keep it.
  if (channel) return;
  const c = supabase.channel('nexus-sync');
  for (const table of TABLES) {
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
