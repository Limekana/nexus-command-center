import { Course } from '../types/studies';

export type GradeMode = 'us' | 'ib';

export function calculateGPA(courses: Course[], mode: GradeMode = 'us'): number {
  if (courses.length === 0) return 0;
  const totalWeight = courses.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  if (mode === 'ib') {
    // IB grades 1-7. Weighted average → still on 1-7 scale.
    const weightedSum = courses.reduce((s, c) => s + c.grade * c.weight, 0);
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }
  // US: convert each percent grade to 4.0 points then weight.
  const weightedSum = courses.reduce((s, c) => s + gradeToPoints(c.grade) * c.weight, 0);
  return Math.round((weightedSum / totalWeight) * 100) / 100;
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
