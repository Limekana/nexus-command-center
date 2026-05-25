import { Course, Grade } from '../types/studies';

export type GradeMode = 'us' | 'ib';

// ─── Per-subject score ──────────────────────────────────────────────────
// Weighted average of a subject's grades, using each grade's `weight`
// (assessment weight inside the subject — e.g. final exam = 50%).
// Returns null when the subject has no grades, so callers can skip subjects
// without grades instead of treating them as zero.
export function subjectScore(grades: Grade[]): number | null {
  if (grades.length === 0) return null;
  const totalWeight = grades.reduce((s, g) => s + (g.weight || 0), 0);
  if (totalWeight === 0) {
    // All zero-weight: fall back to a simple mean so the display is non-zero
    // and the user notices the missing weights. This matches the StudyDesk
    // behavior (which treats unweighted grades as equal-weight).
    return grades.reduce((s, g) => s + g.grade, 0) / grades.length;
  }
  return grades.reduce((s, g) => s + g.grade * (g.weight || 0), 0) / totalWeight;
}

// ─── Overall GPA ────────────────────────────────────────────────────────
// Compute the overall GPA across all subjects.
//
//   - Each subject gets a single score via `subjectScore(...)`
//   - Subjects without any grades are SKIPPED (not counted toward the
//     weighted average — they contribute neither credits nor a score)
//   - Subjects' contribution is weighted by `Course.credits`
//   - For 'us' mode, each subject score is converted to a 4.0 GPA point via
//     `gradeToPoints(...)` before being weighted
//   - For 'ib' mode, the score is already on the 1–7 scale; we weight it
//     directly
//
// Returns 0 when no subject has any grades — that's the displayed "blank
// state" GPA (UI also has a separate "no courses yet" empty state).
export function calculateGPA(
  courses: Course[],
  gradesBySubject: Map<string, Grade[]>,
  mode: GradeMode = 'us',
): number {
  let totalCredits = 0;
  let weightedSum = 0;
  for (const c of courses) {
    const grades = gradesBySubject.get(c.id) ?? [];
    const score = subjectScore(grades);
    if (score == null) continue;
    const credits = c.credits || 1;
    totalCredits += credits;
    weightedSum += (mode === 'us' ? gradeToPoints(score) : score) * credits;
  }
  if (totalCredits === 0) return 0;
  return Math.round((weightedSum / totalCredits) * 100) / 100;
}

export function gradeToPoints(grade: number): number {
  if (grade >= 93) return 4.0;
  if (grade >= 90) return 3.7;
  if (grade >= 87) return 3.3;
  if (grade >= 83) return 3.0;
  if (grade >= 80) return 2.7;
  if (grade >= 77) return 2.3;
  if (grade >= 73) return 2.0;
  if (grade >= 70) return 1.7;
  if (grade >= 67) return 1.3;
  if (grade >= 60) return 1.0;
  return 0;
}

export function gradeToLetter(grade: number, mode: GradeMode = 'us'): string {
  if (mode === 'ib') {
    // IB grade is 1-7 directly.
    return String(Math.round(grade));
  }
  if (grade >= 93) return 'A';
  if (grade >= 90) return 'A–';
  if (grade >= 87) return 'B+';
  if (grade >= 83) return 'B';
  if (grade >= 80) return 'B–';
  if (grade >= 77) return 'C+';
  if (grade >= 73) return 'C';
  if (grade >= 70) return 'C–';
  if (grade >= 67) return 'D+';
  if (grade >= 60) return 'D';
  return 'F';
}

export function ibBand(grade: number): string {
  if (grade >= 7) return 'Excellent';
  if (grade >= 6) return 'Very good';
  if (grade >= 5) return 'Good';
  if (grade >= 4) return 'Satisfactory';
  if (grade >= 3) return 'Mediocre';
  if (grade >= 2) return 'Poor';
  return 'Very poor';
}

export function gradeScaleLabel(mode: GradeMode): string {
  return mode === 'ib' ? '/ 7.0' : '/ 4.0';
}
