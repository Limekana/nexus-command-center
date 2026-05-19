import Papa from 'papaparse';
import { Course } from '../types/studies';

export interface ParsedCSVResult {
  courses: Omit<Course, 'id' | 'createdAt' | 'importId'>[];
  errors: string[];
}

export function parseStudyDeskCSV(csvText: string): ParsedCSVResult {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const errors: string[] = [];
  const courses: Omit<Course, 'id' | 'createdAt' | 'importId'>[] = [];

  if (result.errors.length) {
    errors.push(...result.errors.map(e => e.message));
  }

  for (const row of result.data as any[]) {
    const name = row.course || row.name || row.subject || '';
    const weight = parseFloat(row.weight || row.credits || '0');
    const grade = parseFloat(row.grade || row.score || '0');
    const semester = row.semester || row.term || undefined;

    if (!name) { errors.push(`Row missing course name: ${JSON.stringify(row)}`); continue; }
    if (isNaN(weight) || weight <= 0) { errors.push(`Invalid weight for ${name}`); continue; }
    if (isNaN(grade) || grade < 0 || grade > 100) { errors.push(`Invalid grade for ${name}`); continue; }

    courses.push({ name: name.trim(), weight, grade, semester });
  }

  return { courses, errors };
}
