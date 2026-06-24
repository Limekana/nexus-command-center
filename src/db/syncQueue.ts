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

export async function markAllSynced(): Promise<void> {
  const pending = await listPending();
  const now = new Date().toISOString();
  await db.transaction('rw', db.syncQueue, async () => {
    for (const item of pending) {
      await db.syncQueue.update(item.id, { syncedAt: now });
    }
  });
}
