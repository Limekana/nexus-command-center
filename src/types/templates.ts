// Smart Templates — recurring patterns detected from local Dexie data and
// surfaced as one-tap pre-fills on Add screens + Quick Log FAB.
//
// Templates are *derived*, not stored permanently. The ids are synthesized
// from the canonical payload so a given recurring pattern always has the
// same id across detection runs (useful for stable React keys, not durable
// references).

import type { TransactionType } from './finance';
import type { TaskPriority, TaskCategory } from './tasks';

export interface TransactionTemplate {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId?: string;
  /** Occurrences observed in the detection window. */
  frequency: number;
  /** ISO date of the most recent matching transaction. */
  lastUsed: string;
}

export interface WorkoutTemplate {
  id: string;
  exercise: string;
  weightKg?: number;
  reps?: number;
  frequency: number;
  lastUsed: string;
}

export interface TaskTemplate {
  id: string;
  title: string;
  priority: TaskPriority;
  category?: TaskCategory;
  frequency: number;
  lastUsed: string;
}

export interface QuickTemplates {
  transactions: TransactionTemplate[];
  workouts: WorkoutTemplate[];
  tasks: TaskTemplate[];
}
