import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeClient } from '../test/fakePostgrest';
import { legacyIdToUuid } from '../utils/uuid';

// v1.16 (NCC#58, part 1) — a habit completion is ONE fact per (habit, day).
// Against a stand-in that enforces `UNIQUE (habit_id, date)` the way Postgres
// does. Before this fix, the second device to mark a habit on a given day hit
// 23505, which `pushQueue` classes as permanent — the item was dropped with no
// retry — and the pull then left both local rows in place, counting the day
// twice.

const holder = vi.hoisted(() => ({ client: null as any }));
vi.mock('./supabase', () => ({
  get supabase() {
    return holder.client;
  },
}));

const { pushQueue, hydrateHabitsFromCloud } = await import('./cloudSync');
const { db } = await import('../db/database');

const USER = 'user-1';
const HABIT = crypto.randomUUID();
const DAY = '2026-09-21';
const T0 = '2026-09-21T08:00:00Z';

const uniques = { habit_completions: [['habit_id', 'date']] };

function serverCompletion(id: string, amount = 1, date = DAY) {
  return { id, habit_id: HABIT, user_id: USER, date, amount, created_at: T0 };
}
function localCompletion(id: string, amount = 1, date = DAY, syncStatus: 'synced' | 'pending' = 'synced', habitId = HABIT) {
  return { id, habitId, date, amount, syncStatus, createdAt: T0 };
}
async function queue(operation: 'insert' | 'update' | 'delete', entityId: string, payload: object) {
  await db.syncQueue.add({
    id: crypto.randomUUID(),
    entityType: 'habit_completion',
    entityId,
    operation,
    payload: JSON.stringify(payload),
    createdAt: T0,
  });
}

beforeEach(async () => {
  holder.client = null;
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('pushHabitCompletion — the second device on the same day', () => {
  it('applies its amount to the existing row instead of being dropped', async () => {
    const [deviceA, deviceB] = [crypto.randomUUID(), crypto.randomUUID()];
    holder.client = fakeClient({ habit_completions: [serverCompletion(deviceA, 1)] }, { uniques });
    await queue('insert', deviceB, localCompletion(deviceB, 3, DAY, 'pending'));

    const result = await pushQueue(USER);

    expect(result.errors).toEqual([]);
    expect(result.succeeded).toBe(1);
    const rows = holder.client.tables.habit_completions;
    expect(rows).toHaveLength(1);
    // The server row keeps its own id — no primary-key rewrite to ping-pong.
    expect(rows[0]).toMatchObject({ id: deviceA, amount: 3 });
  });

  it('still inserts normally when the day is free', async () => {
    const id = crypto.randomUUID();
    holder.client = fakeClient({ habit_completions: [] }, { uniques });
    await queue('insert', id, localCompletion(id, 2, DAY, 'pending'));
    await pushQueue(USER);
    expect(holder.client.tables.habit_completions).toEqual([
      expect.objectContaining({ id, habit_id: HABIT, date: DAY, amount: 2 }),
    ]);
  });

  it('does not rewrite the id even on a plain update of the same day', async () => {
    const [deviceA, deviceB] = [crypto.randomUUID(), crypto.randomUUID()];
    holder.client = fakeClient({ habit_completions: [serverCompletion(deviceA, 1)] }, { uniques });
    await queue('update', deviceB, localCompletion(deviceB, 5, DAY, 'pending'));
    await pushQueue(USER);
    expect(holder.client.tables.habit_completions).toEqual([
      expect.objectContaining({ id: deviceA, amount: 5 }),
    ]);
  });
});

describe('pushHabitCompletion — un-marking a day', () => {
  it('removes the day even when the server knows it under another id', async () => {
    const [deviceA, deviceB] = [crypto.randomUUID(), crypto.randomUUID()];
    holder.client = fakeClient({ habit_completions: [serverCompletion(deviceA)] }, { uniques });
    await queue('delete', deviceB, { id: deviceB, habitId: HABIT, date: DAY });
    await pushQueue(USER);
    expect(holder.client.tables.habit_completions).toEqual([]);
  });

  it('only removes that day, not the habit\'s other days', async () => {
    const other = crypto.randomUUID();
    const target = crypto.randomUUID();
    holder.client = fakeClient(
      { habit_completions: [serverCompletion(target), serverCompletion(other, 1, '2026-09-22')] },
      { uniques },
    );
    await queue('delete', target, { id: target, habitId: HABIT, date: DAY });
    await pushQueue(USER);
    expect(holder.client.tables.habit_completions.map((r: any) => r.id)).toEqual([other]);
  });

  it('still honours a delete queued by an older build, which carries only the id', async () => {
    const id = crypto.randomUUID();
    holder.client = fakeClient({ habit_completions: [serverCompletion(id)] }, { uniques });
    await queue('delete', id, { id });
    await pushQueue(USER);
    expect(holder.client.tables.habit_completions).toEqual([]);
    expect(holder.client.writes[0].filters).toEqual([['eq', 'id', id]]);
  });
});

describe('hydrateHabitsFromCloud — one local row per (habit, day)', () => {
  it('replaces this device\'s row for a day with the server\'s', async () => {
    const [deviceA, deviceB] = [crypto.randomUUID(), crypto.randomUUID()];
    await db.habitCompletions.put(localCompletion(deviceB, 3) as any);
    holder.client = fakeClient({ habits: [], habit_completions: [serverCompletion(deviceA, 3)] });

    await hydrateHabitsFromCloud(USER);

    const local = await db.habitCompletions.toArray();
    expect(local.map((c) => c.id)).toEqual([deviceA]);
  });

  it('collapses a row held under its legacy id onto the pulled uuid row', async () => {
    const legacy = 'completion-1700000000000';
    await db.habitCompletions.put(localCompletion(legacy) as any);
    holder.client = fakeClient({ habits: [], habit_completions: [serverCompletion(legacyIdToUuid(legacy))] });

    await hydrateHabitsFromCloud(USER);

    expect((await db.habitCompletions.toArray()).map((c) => c.id)).toEqual([legacyIdToUuid(legacy)]);
  });

  it('leaves other days and not-yet-pushed completions alone', async () => {
    const server = crypto.randomUUID();
    const otherDay = crypto.randomUUID();
    const unpushed = crypto.randomUUID();
    await db.habitCompletions.bulkPut([
      localCompletion(otherDay, 1, '2026-09-20'),
      localCompletion(unpushed, 1, '2026-09-23', 'pending'),
    ] as any);
    holder.client = fakeClient({ habits: [], habit_completions: [serverCompletion(server)] });

    await hydrateHabitsFromCloud(USER);

    expect((await db.habitCompletions.toArray()).map((c) => c.id).sort()).toEqual(
      [server, otherDay, unpushed].sort(),
    );
  });
});
