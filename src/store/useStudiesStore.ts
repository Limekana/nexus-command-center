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

async function recomputeImport(importId: string, mode: GradeMode): Promise<GradeImport | null> {
  const imp = await db.gradeImports.get(importId);
  if (!imp) return null;
  const courses = await db.courses.where('importId').equals(importId).toArray();
  // Pull the grades for these courses to feed the multi-grade GPA aggregator.
  // We pull all grades and index by subject — for small course counts (the
  // realistic case) this is much cheaper than N round-trips.
  const allGrades = await db.grades.toArray();
  const idx = indexGradesBySubject(allGrades);
  const updated: GradeImport = {
    ...imp,
    calculatedGpa: calculateGPA(courses, idx, mode),
    courses,
    importedAt: new Date().toISOString(),
  };
  await db.gradeImports.put(updated);
  return updated;
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
    const [imports, allGrades, studySessions, readings] = await Promise.all([
      db.gradeImports.orderBy('importedAt').reverse().toArray(),
      db.grades.toArray(),
      db.studySessions.orderBy('startedAt').reverse().toArray(),
      db.readings.orderBy('updatedAt').reverse().toArray(),
    ]);
    const latest = imports[0] ?? null;
    const previous = imports[1] ?? null;
    let courses: Course[] = [];
    if (latest) {
      courses = await db.courses.where('importId').equals(latest.id).toArray();
    }
    const idx = indexGradesBySubject(allGrades);
    set({
      currentImport: latest
        ? { ...latest, courses, calculatedGpa: calculateGPA(courses, idx, gradeMode) }
        : null,
      courses,
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
    // Recompute current import GPA under the new scale.
    const imp = get().currentImport;
    if (imp) {
      const idx = indexGradesBySubject(get().grades);
      const updated = { ...imp, calculatedGpa: calculateGPA(get().courses, idx, mode) };
      await db.gradeImports.put(updated);
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
    const updated = await recomputeImport(imp.id, get().gradeMode);
    set({
      courses: [...get().courses, course],
      currentImport: updated,
    });
  },

  async updateCourse(id, patch) {
    const existing = await db.courses.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch, id };
    await db.courses.put(updated);
    await enqueue('course', id, 'update', updated);
    const recomputed = existing.importId
      ? await recomputeImport(existing.importId, get().gradeMode)
      : null;
    set({
      courses: get().courses.map((c) => (c.id === id ? updated : c)),
      currentImport: recomputed ?? get().currentImport,
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
    const recomputed = existing.importId
      ? await recomputeImport(existing.importId, get().gradeMode)
      : null;
    set({
      courses: get().courses.filter((c) => c.id !== id),
      grades: get().grades.filter((g) => g.subjectId !== id),
      currentImport: recomputed ?? get().currentImport,
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
      await db.gradeImports.put(updated);
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
      await db.gradeImports.put(recomputed);
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
      await db.gradeImports.put(recomputed);
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
