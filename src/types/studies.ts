import { SyncStatus } from './finance';

export interface Course {
  id: string;
  importId: string;
  name: string;
  weight: number;
  grade: number;
  semester?: string;
  createdAt: string;
}

export interface GradeImport {
  id: string;
  importedAt: string;
  source: 'csv' | 'manual';
  calculatedGpa: number;
  courses: Course[];
}

// v2-B: Study Sessions ─────────────────────────────────────────────────────
// Time-bound learning activity. subject_id is optional — general study
// without a specific course is allowed.
export interface StudySession {
  id: string;
  startedAt: string;            // ISO timestamp
  durationMinutes: number;      // > 0, ≤ 1440 (1 day cap — server enforces)
  subjectId?: string;           // optional FK to local Course / remote subjects
  notes?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

// v2-B: Reading Log ────────────────────────────────────────────────────────
// Personal library — books read for any reason, school or otherwise. The
// optional subjectId is for the case where a book IS tied to a course
// (e.g. "Calculus Textbook" for Math 101).
export type ReadingStatus = 'to_read' | 'reading' | 'finished' | 'abandoned';

export interface Reading {
  id: string;
  title: string;
  author?: string;
  status: ReadingStatus;
  totalPages?: number;
  pagesRead?: number;
  rating?: number;              // 1-5, optional
  subjectId?: string;
  startedAt?: string;           // ISO timestamp, set when status moves to 'reading'
  finishedAt?: string;          // ISO timestamp, set when status moves to 'finished'
  notes?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
