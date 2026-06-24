import { SyncStatus } from './finance';

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskCategory = 'study' | 'personal' | 'finance' | 'work';

export interface Task {
  id: string;
  title: string;
  dueDate?: string;
  priority: TaskPriority;
  category?: TaskCategory;
  completed: boolean;
  notes?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  // Populated by cloud pull. When set and != current user's id, this row is
  // shared *to* us by another user.
  ownerId?: string;
}
