import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeClient } from '../test/fakePostgrest';
import { legacyIdToUuid } from '../utils/uuid';

// v1.16 (NCC#56) — NCC honours StudyDesk's deletes.
//
// StudyDesk only ever soft-deletes courses, grades and study sessions. NCC's
// pull used to filter `deleted_at IS NULL` and `bulkPut` what came back, so a
// row deleted in StudyDesk stayed on every NCC device that had already pulled
// it, and kept counting towards NCC's GPA, study hours and Life Score.

const holder = vi.hoisted(() => ({ client: null as any }));
vi.mock('./supabase', () => ({
  get supabase() {
    return holder.client;
  },
}));

const { hydrateStudiesFromCloud } = await import('./cloudSync');
const { db } = await import('../db/database');

const USER = 'user-1';
const T0 = '2026-01-01T00:00:00Z';
const DELETED = '2026-02-01T00:00:00Z';

const uuid = () => crypto.randomUUID();

function subject(id: string, deleted = false) {
  return { id, user_id: USER, name: `Course ${id.slice(0, 4)}`, credits: 1, created_at: T0, deleted_at: deleted ? DELETED : null };
}
function grade(id: string, subjectId: string, deleted = false) {
  return { id, user_id: USER, subject_id: subjectId, grade: 6, weight: 1, created_at: T0, updated_at: T0, deleted_at: deleted ? DELETED : null };
}
function session(id: string, deleted = false) {
  return { id, user_id: USER, started_at: T0, duration_minutes: 30, created_at: T0, updated_at: T0, deleted_at: deleted ? DELETED : null };
}
function localCourse(id: string) {
  return { id, importId: 'cloud', name: 'x', credits: 1, createdAt: T0 };
}

beforeEach(async () => {
  holder.client = null;
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('hydrateStudiesFromCloud — tombstones', () => {
  it('removes a course deleted in StudyDesk and keeps the live one', async () => {
    const live = uuid();
    const gone = uuid();
    await db.courses.bulkPut([localCourse(live), localCourse(gone)] as any);
    holder.client = fakeClient({ subjects: [subject(live), subject(gone, true)] });

    const r = await hydrateStudiesFromCloud(USER);

    expect(r.errors).toEqual([]);
    expect((await db.courses.toArray()).map((c) => c.id)).toEqual([live]);
  });

  it('removes deleted grades and study sessions the same way', async () => {
    const course = uuid();
    const [g1, g2, s1, s2] = [uuid(), uuid(), uuid(), uuid()];
    await db.grades.bulkPut([
      { id: g1, subjectId: course, grade: 6, weight: 1, syncStatus: 'synced', createdAt: T0 },
      { id: g2, subjectId: course, grade: 6, weight: 1, syncStatus: 'synced', createdAt: T0 },
    ] as any);
    await db.studySessions.bulkPut([
      { id: s1, startedAt: T0, durationMinutes: 30, syncStatus: 'synced', createdAt: T0 },
      { id: s2, startedAt: T0, durationMinutes: 30, syncStatus: 'synced', createdAt: T0 },
    ] as any);
    holder.client = fakeClient({
      subjects: [subject(course)],
      grades: [grade(g1, course), grade(g2, course, true)],
      study_sessions: [session(s1, true), session(s2)],
    });

    await hydrateStudiesFromCloud(USER);

    expect((await db.grades.toArray()).map((g) => g.id)).toEqual([g1]);
    expect((await db.studySessions.toArray()).map((s) => s.id)).toEqual([s2]);
  });

  it('never writes a tombstoned row into the local table', async () => {
    // A device that never had the course must not gain it from the pull.
    const gone = uuid();
    holder.client = fakeClient({ subjects: [subject(gone, true)] });
    await hydrateStudiesFromCloud(USER);
    expect(await db.courses.count()).toBe(0);
  });

  it('matches a local row stored under a legacy id by the uuid it was pushed as', async () => {
    const legacy = 'course-1700000000000';
    await db.courses.put(localCourse(legacy) as any);
    holder.client = fakeClient({ subjects: [subject(legacyIdToUuid(legacy), true)] });
    await hydrateStudiesFromCloud(USER);
    expect(await db.courses.count()).toBe(0);
  });

  it('removes a tombstoned row even with a pending local edit — the delete wins', async () => {
    // StudyDesk's rule, and the server's too: NCC's grade upsert never sends
    // deleted_at, so that pending edit cannot un-delete the row upstream.
    const course = uuid();
    const g = uuid();
    await db.grades.put({ id: g, subjectId: course, grade: 7, weight: 1, syncStatus: 'pending', createdAt: T0 } as any);
    holder.client = fakeClient({ subjects: [subject(course)], grades: [grade(g, course, true)] });
    await hydrateStudiesFromCloud(USER);
    expect(await db.grades.get(g)).toBeUndefined();
  });

  it('leaves a row the server has never seen alone — only explicit tombstones remove', async () => {
    // Unlike an "absent from the pull" prune, a brand-new local course that has
    // not pushed yet is not touched.
    const localOnly = uuid();
    await db.courses.put(localCourse(localOnly) as any);
    holder.client = fakeClient({ subjects: [] });
    await hydrateStudiesFromCloud(USER);
    expect(await db.courses.get(localOnly)).toBeDefined();
  });

  it('removes nothing when the pull fails', async () => {
    const gone = uuid();
    await db.courses.put(localCourse(gone) as any);
    holder.client = fakeClient(
      { subjects: [subject(gone, true)] },
      { failWhen: (req) => (req.table === 'subjects' ? { code: '57014', message: 'statement timeout' } : null) },
    );
    const r = await hydrateStudiesFromCloud(USER);
    expect(r.errors.some((e) => e.startsWith('subjects:'))).toBe(true);
    expect(await db.courses.get(gone)).toBeDefined();
  });

  it('pulls without a deleted_at filter, so tombstones reach the device at all', async () => {
    holder.client = fakeClient({});
    await hydrateStudiesFromCloud(USER);
    const studyReqs = holder.client.requests.filter((r: any) =>
      ['subjects', 'grades', 'study_sessions'].includes(r.table),
    );
    expect(studyReqs.length).toBe(3);
    expect(studyReqs.every((r: any) => !r.filters.some(([, col]: any) => col === 'deleted_at'))).toBe(true);
  });
});
