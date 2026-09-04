import { db, SyncQueueItem } from './database';
import { generateId } from '../utils/uuid';

export async function enqueue(
  entityType: SyncQueueItem['entityType'],
  entityId: string,
  operation: SyncQueueItem['operation'],
  payload: unknown
): Promise<void> {
  await db.syncQueue.add({
    id: generateId(),
    entityType,
    entityId,
    operation,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
  });
}

/** Kept in terms of listPending so "pending" has exactly one definition here.
 * The old indexed count could not express the quarantine exclusion — an index
 * on syncedAt says nothing about quarantinedAt — and a count that disagreed
 * with the list it summarises is worse than a table scan of a queue that is
 * empty in the normal case. */
export async function pendingCount(): Promise<number> {
  return (await listPending()).length;
}

/**
 * Items still owed to the server: not yet written, and not quarantined.
 *
 * Quarantined items are excluded deliberately. They are still queued — the
 * user's content is intact and `listQuarantined()` surfaces it — but they
 * have stopped being retried, so counting them here would make pushQueue
 * re-attempt them every drain and keep the 30s background flusher (which
 * fires whenever pendingCount > 0) awake forever. That unbounded-drain
 * behaviour is exactly what the quarantine ceiling exists to prevent.
 */
export async function listPending(): Promise<SyncQueueItem[]> {
  const all = await db.syncQueue.toArray();
  return all.filter((q) => !q.syncedAt && !q.quarantinedAt);
}

/** Items held after repeated failures: never written, never dropped. */
export async function listQuarantined(): Promise<SyncQueueItem[]> {
  const all = await db.syncQueue.toArray();
  return all.filter((q) => !q.syncedAt && q.quarantinedAt);
}

/**
 * Put quarantined items back in the pending set, attempt counters reset.
 *
 * Two callers, and the `reason` filter is why they differ:
 *  - a fresh sign-in or token refresh releases only the `auth` ones, because
 *    the condition that held them is exactly what just changed. A payload
 *    fault is not fixed by a new token, and releasing it would put the item
 *    back on a treadmill it can never get off.
 *  - the manual retry in Settings passes no filter: the user is asking for
 *    everything to be tried again, and one wasted round-trip per item is a
 *    fair price for them being able to act on their own data.
 *
 * Returns how many items were released.
 */
export async function releaseQuarantined(reason?: 'auth' | 'payload'): Promise<number> {
  const held = (await listQuarantined()).filter(
    (q) => reason === undefined || q.quarantineReason === reason
  );
  await Promise.all(
    held.map((q) =>
      db.syncQueue.update(q.id, {
        quarantinedAt: undefined,
        quarantineReason: undefined,
        authAttempts: 0,
      })
    )
  );
  return held.length;
}
