import { describe, it, expect, beforeEach } from 'vitest';
import { stampFor, stampOf, recordSeen, resetEditStamps } from './editStamp';
import { legacyIdToUuid } from '../utils/uuid';

// v1.16 (limecore#27, registry P6) — max(deviceNow, lastSeenServerStamp + 1 ms).

const T = (iso: string) => new Date(iso).getTime();
const NOON = T('2026-09-25T12:00:00.000Z');
const ID = '0b6f2c1e-8a2d-4b8e-9c61-3f1f0c9d2a11';

beforeEach(() => resetEditStamps());

describe('stampFor', () => {
  it('stamps the edit with the device clock when nothing newer is known', () => {
    expect(stampFor('goal', ID, 'update', NOON)).toBe('2026-09-25T12:00:00.000Z');
  });

  it('stamps 1 ms past a pulled row on a device whose clock runs slow', () => {
    recordSeen('goals', [{ id: ID, updated_at: '2026-09-25T12:00:05+00:00' }]);
    expect(stampFor('goal', ID, 'update', NOON)).toBe('2026-09-25T12:00:05.001Z');
  });

  it('leaves the clock alone when it is already ahead of what was pulled', () => {
    recordSeen('goals', [{ id: ID, updated_at: '2026-09-25T11:00:00+00:00' }]);
    expect(stampFor('goal', ID, 'update', NOON)).toBe('2026-09-25T12:00:00.000Z');
  });

  it('keeps one row\'s edits strictly increasing even if the clock steps back', () => {
    const a = stampFor('task', ID, 'update', NOON)!;
    const b = stampFor('task', ID, 'update', NOON - 60_000)!;
    expect(T(b)).toBeGreaterThan(T(a));
  });

  it('matches a legacy local id to the uuid it is pushed and pulled as', () => {
    const legacy = 'goal-1700000000000';
    recordSeen('goals', [{ id: legacyIdToUuid(legacy), updated_at: '2026-09-25T12:00:05+00:00' }]);
    expect(stampFor('goal', legacy, 'update', NOON)).toBe('2026-09-25T12:00:05.001Z');
  });

  it('maps queue entity types to their tables (course → subjects)', () => {
    recordSeen('subjects', [{ id: ID, updated_at: '2026-09-25T12:00:05+00:00' }]);
    expect(stampFor('course', ID, 'update', NOON)).toBe('2026-09-25T12:00:05.001Z');
  });

  it('does not stamp a delete — the server accepts a tombstone whatever its stamp', () => {
    expect(stampFor('goal', ID, 'delete', NOON)).toBeUndefined();
  });

  it('does not stamp an entity type that writes no updated_at', () => {
    for (const t of ['habit_completion', 'feedback', 'app_open', 'workout_session']) {
      expect(stampFor(t, ID, 'insert', NOON)).toBeUndefined();
    }
  });
});

describe('stampOf', () => {
  const item = { createdAt: '2026-09-25T09:00:00.000Z' };

  it('sends the item\'s own stamp when it has one', () => {
    expect(stampOf({ ...item, stamp: '2026-09-25T10:00:00.000Z' }, { updatedAt: '2026-09-25T08:00:00.000Z' })).toBe(
      '2026-09-25T10:00:00.000Z',
    );
  });

  it('for an item from an older build, keeps the old expression: updatedAt, else enqueue time', () => {
    expect(stampOf(item, { updatedAt: '2026-09-25T08:00:00.000Z' })).toBe('2026-09-25T08:00:00.000Z');
    expect(stampOf(item, {})).toBe('2026-09-25T09:00:00.000Z');
    expect(stampOf(item)).toBe('2026-09-25T09:00:00.000Z');
  });
});
