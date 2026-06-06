import { SyncStatus } from './finance';

// A subject / course. Matches StudyDesk's `subjects` table (the upstream
// system that owns this data when sync is enabled).
//
// Notes on shape changes vs. v1.0.0:
//   - `grade` removed — grades live in their own table now (multiple per
//     subject, each with its own weight + date)
//   - `weight` renamed to `credits` to match StudyDesk semantics (course
//     credit hours / EC points). The v7 Dexie upgrade migrates the value.
//     Old rows may still carry a `weight` field; read paths fall back to it.
//   - `color` added — StudyDesk stores a per-subject color; the UI uses it
//     for the row indicator dot.
export interface Course {
  id: string;
  importId: string;
  name: string;
  credits: number;
  color?: string;
  semester?: string;
  /** v1.2 — set by StudyDesk's semester-archive UI. ISO timestamp when
   *  the course was archived; absent/undefined means active. Filtered out
   *  of the active studies UI and GPA computation; surfaced under an
   *  "Archived" toggle. Sync-mirrored via subjects.archived_at column. */
  archivedAt?: string;
  createdAt: string;
}

// A single grade entry for a subject. StudyDesk's `grades` table maps 1:1.
// Many grades per subject; each carries its own weight (assessment weight
// within the subject, NOT the credit hours of the subject itself) and date.
export interface Grade {
  id: string;
  subjectId: string;            // FK → Course.id
  grade: number;                // numeric value, scale depends on gradeMode
  weight: number;               // assessment weight inside the subject (e.g. final exam = 50)
  date?: string;                // YYYY-MM-DD, when the grade was earned
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
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

/**
 * v1.2 — shelf state. Orthogonal to `status` (which tracks reading progress).
 *   - `owned`    Physically (or digitally) on the user's shelf. Default.
 *   - `borrowed` Currently borrowed FROM a library (or any external source).
 *                Optional borrowedFrom + expectedReturnAt drive a return-to-
 *                library reminder. NOTE: v1.2.2 corrected this semantic — the
 *                v1.2 ship initially modeled this as "lent OUT to a friend"
 *                which was the inverse of the v1.2 status-file intent. The
 *                literal was renamed from 'lent' → 'borrowed' and the lent*
 *                fields renamed to borrowed*; Dexie v10 maps existing rows.
 *   - `wishlist` Want-to-own. Doesn't track progress; sits separately so the
 *                Owned shelf isn't cluttered with aspirational entries.
 *
 * Missing shelf field on legacy rows is treated as 'owned' by the UI.
 */
export type ReadingShelf = 'owned' | 'borrowed' | 'wishlist';

export interface Reading {
  id: string;
  title: string;
  author?: string;
  status: ReadingStatus;
  /** v1.2 — Owned / Lent / Wishlist. Defaults to 'owned' when absent. */
  shelf?: ReadingShelf;
  totalPages?: number;
  pagesRead?: number;
  rating?: number;              // 1-5, optional
  /** v1.2 — series grouping. Optional; "The Lord of the Rings" etc. The
   *  Sort=Series view groups books by this field, ordered by seriesNumber
   *  when present (else by title alpha within the group). */
  series?: string;
  /** v1.2 — book number within the series ("1" for The Fellowship of the Ring). */
  seriesNumber?: number;
  subjectId?: string;
  startedAt?: string;           // ISO timestamp, set when status moves to 'reading'
  finishedAt?: string;          // ISO timestamp, set when status moves to 'finished'
  /** v1.2.2 — borrow metadata (set when shelf flips to 'borrowed'). Cleared
   *  when shelf flips away. Drives a return-to-library reminder notification
   *  on expectedReturnAt at 09:00 local. `borrowedFrom` is a free-text label
   *  for the source library / lender (e.g. "Oslo Public Library").
   *  Renamed from lentTo/lentAt in v1.2.2; Dexie v10 upgrade hook re-maps. */
  borrowedFrom?: string;
  borrowedAt?: string;
  expectedReturnAt?: string;
  notes?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
