import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';
import { db } from '../db/database';
import { Course, Grade, GradeImport, StudySession, Reading, ReadingStatus } from '../types/studies';
import { calculateGPA, GradeMode } from '../utils/gpa';
import { generateId } from '../utils/uuid';
import { enqueue } from '../db/syncQueue';

const GRADE_MODE_KEY = 'studies.gradeMode';

async function getPref(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return localStorage.getItem(key);
  }
}
async function setPref(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    localStorage.setItem(key, value);
  }
}

// Build a Map<subjectId, Grade[]> from a flat grades array. Used by the GPA
// aggregator and by the StudiesOverview UI to show per-subject grade lists.
function indexGradesBySubject(grades: Grade[]): Map<string, Grade[]> {
  const map = new Map<string, Grade[]>();
  for (const g of grades) {
    const arr = map.get(g.subjectId);
    if (arr) arr.push(g);
    else map.set(g.subjectId, [g]);
  }
  return map;
}

interface StudiesStore {
  currentImport: GradeImport | null;
  courses: Course[];
  grades: Grade[];
  previousGpa: number | null;
  gradeMode: GradeMode;
  loading: boolean;

  // v2-B
  studySessions: StudySession[];
  readings: Reading[];

  load: () => Promise<void>;
  setGradeMode: (mode: GradeMode) => Promise<void>;

  addCourse: (c: Omit<Course, 'id' | 'createdAt' | 'importId'>) => Promise<void>;
  updateCourse: (id: string, patch: Partial<Course>) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;

  // Grades (per-subject assessments) — added v1.0.3
  addGrade: (g: Omit<Grade, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => Promise<void>;
  updateGrade: (id: string, patch: Partial<Grade>) => Promise<void>;
  deleteGrade: (id: string) => Promise<void>;

  // Study Sessions
  addStudySession: (
    s: Omit<StudySession, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
  ) => Promise<void>;
  updateStudySession: (id: string, patch: Partial<StudySession>) => Promise<void>;
  deleteStudySession: (id: string) => Promise<void>;

  // Reading Log
  addReading: (
    r: Omit<Reading, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>,
  ) => Promise<void>;
  updateReading: (id: string, patch: Partial<Reading>) => Promise<void>;
  setReadingStatus: (id: string, status: ReadingStatus) => Promise<void>;
  deleteReading: (id: string) => Promise<void>;
}

async function ensureManualImport(): Promise<GradeImport> {
  const imports = await db.gradeImports.orderBy('importedAt').reverse().toArray();
  const existing = imports.find((i) => i.source === 'manual');
  if (existing) return existing;
  const imp: GradeImport = {
    id: generateId(),
    importedAt: new Date().toISOString(),
    source: 'manual',
    calculatedGpa: 0,
    courses: [],
  };
  await db.gradeImports.add(imp);
  return imp;
}

export const useStudiesStore = create<StudiesStore>((set, get) => ({
  currentImport: null,
  courses: [],
  grades: [],
  previousGpa: null,
  gradeMode: 'us',
  loading: false,
  studySessions: [],
  readings: [],

  async load() {
    set({ loading: true });
    const stored = await getPref(GRADE_MODE_KEY);
    const gradeMode: GradeMode = stored === 'ib' ? 'ib' : 'us';
    // Load ALL courses + grades regardless of importId. The importId field is
    // a vestigial artifact from the old CSV-import path; cloud-synced subjects
    // from StudyDesk arrive stamped 'cloud' and would otherwise be invisible
    // to the UI. There is now a single working set of courses + grades —
    // origin (cloud / manual / legacy CSV) no longer matters for display.
    const [imports, allCoursesIncludingArchived, allGrades, studySessions, readings] = await Promise.all([
      db.gradeImports.orderBy('importedAt').reverse().toArray(),
      db.courses.toArray(),
      db.grades.toArray(),
      db.studySessions.orderBy('startedAt').reverse().toArray(),
      db.readings.orderBy('updatedAt').reverse().toArray(),
    ]);
    // v1.2 — exclude archived courses from the live working set. The full
    // list stays in Dexie so a future "Show archived" NCC affordance can
    // surface them; for v1.1.2 NCC is a silent consumer of StudyDesk's
    // archive state (archived semesters disappear from Studies + GPA
    // automatically). Archived rows continue to ride the realtime channel
    // and re-hydrate correctly on restore.
    const allCourses = allCoursesIncludingArchived.filter((c) => !c.archivedAt);
    const previous = imports[1] ?? null;
    const idx = indexGradesBySubject(allGrades);
    const gpa = calculateGPA(allCourses, idx, gradeMode);
    // Synthesize a single in-memory currentImport so the UI (which consumes
    // currentImport.calculatedGpa) gets a live aggregate even when there are
    // zero gradeImport rows. Not persisted — recomputed on every load() and
    // on every mutation.
    const synthCurrentImport: GradeImport = {
      id: 'cloud',
      importedAt: new Date().toISOString(),
      source: 'manual',
      calculatedGpa: gpa,
      courses: allCourses,
    };
    set({
      currentImport: synthCurrentImport,
      courses: allCourses,
      grades: allGrades,
      previousGpa: previous ? previous.calculatedGpa : null,
      gradeMode,
      studySessions,
      readings,
      loading: false,
    });
  },

  async setGradeMode(mode) {
    await setPref(GRADE_MODE_KEY, mode);
    set({ gradeMode: mode });
    // Recompute the synthetic currentImport's GPA under the new scale. Not
    // persisted — currentImport is derived state.
    const imp = get().currentImport;
    if (imp) {
      const idx = indexGradesBySubject(get().grades);
      const updated = { ...imp, calculatedGpa: calculateGPA(get().courses, idx, mode) };
      set({ currentImport: updated });
    }
  },

  async addCourse(c) {
    const imp = await ensureManualImport();
    const course: Course = {
      ...c,
      id: generateId(),
      importId: imp.id,
      createdAt: new Date().toISOString(),
    };
    await db.courses.add(course);
    await enqueue('course', course.id, 'insert', course);
    const nextCourses = [...get().courses, course];
    const idx = indexGradesBySubject(get().grades);
    const cur = get().currentImport;
    set({
      courses: nextCourses,
      currentImport: cur
        ? { ...cur, courses: nextCourses, calculatedGpa: calculateGPA(nextCourses, idx, get().gradeMode) }
        : cur,
    });
  },

  async updateCourse(id, patch) {
    const existing = await db.courses.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch, id };
    await db.courses.put(updated);
    await enqueue('course', id, 'update', updated);
    const nextCourses = get().courses.map((c) => (c.id === id ? updated : c));
    const idx = indexGradesBySubject(get().grades);
    const cur = get().currentImport;
    set({
      courses: nextCourses,
      currentImport: cur
        ? { ...cur, courses: nextCourses, calculatedGpa: calculateGPA(nextCourses, idx, get().gradeMode) }
        : cur,
    });
  },

  async deleteCourse(id) {
    const existing = await db.courses.get(id);
    if (!existing) return;
    // Cascade: delete the subject's grades locally + enqueue grade deletes so
    // the cloud follows. StudyDesk does the same cascade server-side, but we
    // can't rely on that for offline use.
    const childGrades = await db.grades.where('subjectId').equals(id).toArray();
    for (const g of childGrades) {
      await db.grades.delete(g.id);
      await enqueue('grade', g.id, 'delete', { id: g.id });
    }
    await db.courses.delete(id);
    await enqueue('course', id, 'delete', { id });
    const nextCourses = get().courses.filter((c) => c.id !== id);
    const nextGrades = get().grades.filter((g) => g.subjectId !== id);
    const idx = indexGradesBySubject(nextGrades);
    const cur = get().currentImport;
    set({
      courses: nextCourses,
      grades: nextGrades,
      currentImport: cur
        ? { ...cur, courses: nextCourses, calculatedGpa: calculateGPA(nextCourses, idx, get().gradeMode) }
        : cur,
    });
  },

  // ── Grades (per-subject assessments) ──────────────────────────────────
  async addGrade(input) {
    const now = new Date().toISOString();
    const grade: Grade = {
      ...input,
      id: generateId(),
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await db.grades.add(grade);
    await enqueue('grade', grade.id, 'insert', grade);
    const nextGrades = [...get().grades, grade];
    set({ grades: nextGrades });
    const imp = get().currentImport;
    if (imp) {
      const idx = indexGradesBySubject(nextGrades);
      const updated = {
        ...imp,
        calculatedGpa: calculateGPA(get().courses, idx, get().gradeMode),
      };
      set({ currentImport: updated });
    }
  },

  async updateGrade(id, patch) {
    const existing = await db.grades.get(id);
    if (!existing) return;
    const updated: Grade = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await db.grades.put(updated);
    await enqueue('grade', id, 'update', updated);
    const nextGrades = get().grades.map((g) => (g.id === id ? updated : g));
    set({ grades: nextGrades });
    const imp = get().currentImport;
    if (imp) {
      const idx = indexGradesBySubject(nextGrades);
      const recomputed = {
        ...imp,
        calculatedGpa: calculateGPA(get().courses, idx, get().gradeMode),
      };
      set({ currentImport: recomputed });
    }
  },

  async deleteGrade(id) {
    await db.grades.delete(id);
    await enqueue('grade', id, 'delete', { id });
    const nextGrades = get().grades.filter((g) => g.id !== id);
    set({ grades: nextGrades });
    const imp = get().currentImport;
    if (imp) {
      const idx = indexGradesBySubject(nextGrades);
      const recomputed = {
        ...imp,
        calculatedGpa: calculateGPA(get().courses, idx, get().gradeMode),
      };
      set({ currentImport: recomputed });
    }
  },

  // ── Study Sessions ─────────────────────────────────────────────────────
  async addStudySession(s) {
    const now = new Date().toISOString();
    const session: StudySession = {
      ...s,
      id: generateId(),
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await db.studySessions.add(session);
    await enqueue('study_session', session.id, 'insert', session);
    // Newest-first by startedAt.
    set({
      studySessions: [session, ...get().studySessions].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      ),
    });
  },

  async updateStudySession(id, patch) {
    const existing = await db.studySessions.get(id);
    if (!existing) return;
    const updated: StudySession = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await db.studySessions.put(updated);
    await enqueue('study_session', id, 'update', updated);
    set({
      studySessions: get()
        .studySessions.map((s) => (s.id === id ? updated : s))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    });
  },

  async deleteStudySession(id) {
    await db.studySessions.delete(id);
    await enqueue('study_session', id, 'delete', { id });
    set({ studySessions: get().studySessions.filter((s) => s.id !== id) });
  },

  // ── Reading Log ────────────────────────────────────────────────────────
  async addReading(r) {
    const now = new Date().toISOString();
    const reading: Reading = {
      ...r,
      id: generateId(),
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await db.readings.add(reading);
    await enqueue('reading', reading.id, 'insert', reading);
    set({
      readings: [reading, ...get().readings].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    });
  },

  async updateReading(id, patch) {
    const existing = await db.readings.get(id);
    if (!existing) return;
    const updated: Reading = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await db.readings.put(updated);
    await enqueue('reading', id, 'update', updated);
    set({
      readings: get()
        .readings.map((r) => (r.id === id ? updated : r))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    });
  },

  // Status-only update helper. Auto-stamps startedAt when transitioning to
  // 'reading' (if not already set), and finishedAt when transitioning to
  // 'finished'. Both are guarded so re-applying a status doesn't clobber an
  // earlier timestamp the user may have manually edited.
  async setReadingStatus(id, status) {
    const existing = await db.readings.get(id);
    if (!existing) return;
    const now = new Date().toISOString();
    const patch: Partial<Reading> = { status };
    if (status === 'reading' && !existing.startedAt) patch.startedAt = now;
    if (status === 'finished' && !existing.finishedAt) patch.finishedAt = now;
    await get().updateReading(id, patch);
  },

  async deleteReading(id) {
    await db.readings.delete(id);
    await enqueue('reading', id, 'delete', { id });
    set({ readings: get().readings.filter((r) => r.id !== id) });
  },
}));

// Re-export the indexing helper so UI screens can build per-subject views
// without re-implementing the grouping logic.
export { indexGradesBySubject };
