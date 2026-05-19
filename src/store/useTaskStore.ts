import { create } from 'zustand';
import { db } from '../db/database';
import { Task } from '../types/tasks';
import { generateId } from '../utils/uuid';
import { enqueue } from '../db/syncQueue';

export type TaskFilter = 'all' | 'today' | 'overdue' | 'done';

interface TaskStore {
  tasks: Task[];
  filter: TaskFilter;
  setFilter: (f: TaskFilter) => void;
  load: () => Promise<void>;
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'completed'>) => Promise<void>;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  filter: 'all',

  setFilter(f) {
    set({ filter: f });
  },

  async load() {
    const tasks = await db.tasks.toArray();
    tasks.sort((a, b) => {
      const ad = a.dueDate ?? '9999';
      const bd = b.dueDate ?? '9999';
      return ad.localeCompare(bd);
    });
    set({ tasks });
  },

  async addTask(t) {
    const now = new Date().toISOString();
    const task: Task = {
      ...t,
      id: generateId(),
      completed: false,
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await db.tasks.add(task);
    await enqueue('task', task.id, 'insert', task);
    await get().load();
  },

  async updateTask(id, patch) {
    const existing = await db.tasks.get(id);
    if (!existing) return;
    const updated: Task = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await db.tasks.put(updated);
    await enqueue('task', id, 'update', updated);
    await get().load();
  },

  async toggleComplete(id) {
    const task = await db.tasks.get(id);
    if (!task) return;
    const updated: Task = {
      ...task,
      completed: !task.completed,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await db.tasks.put(updated);
    await enqueue('task', id, 'update', updated);
    await get().load();
  },

  async deleteTask(id) {
    await db.tasks.delete(id);
    await enqueue('task', id, 'delete', { id });
    await get().load();
  },
}));
