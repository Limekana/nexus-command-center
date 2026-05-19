import { SyncStatus } from './finance';

// Open-ended split label (push/pull/legs, upper/lower, full body, cardio,
// or anything custom the user enters).
export type WorkoutType = string;

export interface WorkoutSet {
  id: string;
  sessionId: string;
  exercise: string;
  weightKg?: number;
  reps?: number;
  rpe?: number;
  createdAt: string;
}

export interface WorkoutSession {
  id: string;
  sessionType: WorkoutType;
  date: string;
  sets: WorkoutSet[];
  notes?: string;
  syncStatus: SyncStatus;
  createdAt: string;
}
