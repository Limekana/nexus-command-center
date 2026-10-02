import { db, SyncQueueItem } from './database';
import { generateId } from '../utils/uuid';
import { stampFor } from '../lib/editStamp';

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
    // v1.16 (limecore#27, registry P6): stamped here, at the edit — never at
    // push time, when a later pull could lift a stale edit past a newer one.
    stamp: stampFor(entityType, entityId, operation),
  });
}

export async function pendingCount(): Promise<number> {
  return db.syncQueue.where('syncedAt').equals('').or('syncedAt').equals(undefined as any).count().catch(async () => {
    const all = await db.syncQueue.toArray();
    return all.filter((q) => !q.syncedAt).length;
  });
}

export async function listPending(): Promise<SyncQueueItem[]> {
  const all = await db.syncQueue.toArray();
  return all.filter((q) => !q.syncedAt);
}

