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

// v1.4 — the Reading Log / personal-library feature was retired. It had no
// entry UI since BUG-16 and its library reminders fired broken notifications.
// The `Reading`/`ReadingStatus`/`ReadingShelf` types, the `readings` Dexie
// table (dropped in Dexie v17), the cloud sync path, and the `reading_count`
// goal type were all removed in v1.4.0.
