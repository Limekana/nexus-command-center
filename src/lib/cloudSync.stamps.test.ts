import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeClient } from '../test/fakePostgrest';

// v1.16 (limecore#27, registry P6) — NCC's client half, through the REAL
// sync queue and the REAL push handlers. Only the Supabase client is a
// stand-in, and it records what would be sent.

const holder = vi.hoisted(() => ({ client: null as any }));
vi.mock('./supabase', () => ({
  get supabase() {
    return holder.client;
  },
}));

const { pushQueue, pullAll } = await import('./cloudSync');
const { enqueue } = await import('../db/syncQueue');
const { db } = await import('../db/database');
const { resetEditStamps } = await import('./editStamp');

const USER = 'user-1';

/** The shared read-side fake, plus a capture of upserts. Kept local rather
 *  than added to src/test/fakePostgrest.ts, which gains full write support in
 *  #89 — a sibling of this stack, so editing it here would conflict. */
function client(tables: Record<string, any[]>) {
  const base = fakeClient(tables);
  const writes: { table: string; op: 'upsert'; row: any }[] = [];
  return {
    requests: base.requests,
    writes,
    from(table: string) {
      const b = base.from(table);
      b.upsert = (row: any) => {
        writes.push({ table, op: 'upsert', row });
        return Promise.resolve({ error: null });
      };
      return b;
    },
  };
}
const GOAL_ID = '5a1c7d0e-2f4b-4c3a-9d8e-7b6a5c4d3e2f';
const at = (iso: string) => vi.setSystemTime(new Date(iso));

function goal(over: Record<string, unknown> = {}) {
  return {
    id: GOAL_ID,
    title: 'Run 100 km',
    goalType: 'fitness_distance',
    targetValue: 100,
    startDate: '2026-09-01',
    completed: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    ...over,
  };
}
const sentGoals = () => holder.client.writes.filter((w: any) => w.table === 'goals' && w.op === 'upsert');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  holder.client = client({ goals: [] });
  resetEditStamps();
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a live goal edit can no longer revive a goal deleted elsewhere', () => {
  it('does not send deleted_at at all for a live goal', async () => {
    at('2026-09-25T12:00:00.000Z');
    await enqueue('goal', GOAL_ID, 'update', goal());
    await pushQueue(USER);
    const [w] = sentGoals();
    // Sending `deleted_at: null` made every edit an explicit revival.
    expect('deleted_at' in w.row).toBe(false);
  });

  it('still sends deleted_at when the goal is being deleted', async () => {
    at('2026-09-25T12:00:00.000Z');
    await enqueue('goal', GOAL_ID, 'update', goal({ deletedAt: '2026-09-25T12:00:00.000Z' }));
    await pushQueue(USER);
    expect(sentGoals()[0].row.deleted_at).toBe('2026-09-25T12:00:00.000Z');
  });
});

describe('the edit stamp', () => {
  it('an edit made offline at 10:00 and pushed at 12:00 is sent stamped 10:00', async () => {
    at('2026-09-25T10:00:00.000Z');
    await enqueue('goal', GOAL_ID, 'update', goal({ updatedAt: undefined }));
    at('2026-09-25T12:00:00.000Z');
    await pushQueue(USER);
    expect(sentGoals()[0].row.updated_at).toBe('2026-09-25T10:00:00.000Z');
  });

  it('a slow-clock device editing a goal it just pulled stamps it 1 ms newer', async () => {
    holder.client = client({
      goals: [{
        id: GOAL_ID, user_id: USER, title: 'Run 100 km', goal_type: 'fitness_distance',
        target_value: 100, start_date: '2026-09-01', completed: false,
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-25T12:00:05+00:00', deleted_at: null,
      }],
    });
    at('2026-09-25T12:00:00.000Z');
    await pullAll(USER);
    await enqueue('goal', GOAL_ID, 'update', goal({ title: 'Run 120 km' }));
    await pushQueue(USER);
    expect(sentGoals()[0].row.updated_at).toBe('2026-09-25T12:00:05.001Z');
  });

  it('an item queued by an older build, with no stamp, pushes exactly as before', async () => {
    await db.syncQueue.add({
      id: 'old-item',
      entityType: 'goal',
      entityId: GOAL_ID,
      operation: 'update',
      payload: JSON.stringify(goal({ updatedAt: '2026-09-24T08:00:00.000Z' })),
      createdAt: '2026-09-24T09:00:00.000Z',
    });
    at('2026-09-25T12:00:00.000Z');
    await pushQueue(USER);
    // The old expression: local.updatedAt || item.createdAt.
    expect(sentGoals()[0].row.updated_at).toBe('2026-09-24T08:00:00.000Z');
  });
});
