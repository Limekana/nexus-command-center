// NCC#55 — put back the queue items the manual_assets CHECK made us drop.
//
// v1.2.0 introduced the account types checking, credit_card, investment and
// custom, but `manual_assets_asset_type_check` still allowed only the
// pre-v1.2 set. Every such account was refused with 23514, and every
// transaction booked to it then failed `transactions_account_id_fkey`
// (23503). pushQueue classes both as permanent and marks the item synced with
// a `[dropped]` error, so none of them ever reached the server — 0 checking,
// credit-card or investment accounts exist there.
//
// Queue items are never pruned (only cleared on sign-out), so the dropped
// items are still on the device. Once the constraint accepts the new types
// (supabase/migrations/20260924_manual_assets_account_types.sql) they can be
// pushed as they are. This module picks which ones; it has no I/O so it can be
// checked without a database.

import type { SyncQueueItem } from '../db/database';

export const REQUEUE_TAG = 'ncc-55';

const REVIVABLE: Partial<Record<SyncQueueItem['entityType'], RegExp>> = {
  manual_asset: /manual_assets_asset_type_check/,
  transaction: /transactions_account_id_fkey/,
};

/**
 * Items to put back in the queue: per entity, only the NEWEST item, only when
 * it was dropped for one of the two reasons above, only if it is not a delete,
 * and only once (`requeuedFor`). Anything newer for the same entity — pending
 * or pushed — means the dropped snapshot is stale and must not overwrite it.
 */
export function selectRequeue(items: SyncQueueItem[]): SyncQueueItem[] {
  const newest = new Map<string, SyncQueueItem>();
  for (const it of items) {
    if (!(it.entityType in REVIVABLE)) continue;
    const key = `${it.entityType}::${it.entityId}`;
    const cur = newest.get(key);
    if (!cur || it.createdAt > cur.createdAt) newest.set(key, it);
  }
  const out: SyncQueueItem[] = [];
  for (const it of newest.values()) {
    const why = REVIVABLE[it.entityType];
    if (!why || it.operation === 'delete') continue;
    if (!it.syncedAt || it.requeuedFor === REQUEUE_TAG) continue;
    const err = it.lastError ?? '';
    if (!err.startsWith('[dropped]') || !why.test(err)) continue;
    out.push(it);
  }
  return out;
}
