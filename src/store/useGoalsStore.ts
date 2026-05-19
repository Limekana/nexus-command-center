// Goals store. Mirrors the pattern of useTaskStore (lightweight Zustand
// holding a Dexie-backed array). Sync via the standard `enqueue` queue
// drained by useSyncStore.
//
// We don't compute progress here — that lives in `lib/goals.ts` as a pure
// function so the Goals screen can call it with fresh data from each module
// store and stay in sync without subscribing to every module's state changes
// at this level.

import { create } from 'zustand';
import { db } from '../db/database';
import type { Goal } from '../types/goals';
import { generateId } from '../utils/uuid';
import { enqueue } from '../db/syncQueue';

interface GoalsStore {
  goals: Goal[];
  loaded: boolean;
  load: () => Promise<void>;
  addGoal: (
    g: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'completed' | 'completedAt' | 'deletedAt'>,
  ) => Promise<void>;
  updateGoal: (
    id: string,
    patch: Partial<Omit<Goal, 'id' | 'createdAt' | 'syncStatus'>>,
  ) => Promise<void>;
  markCompleted: (id: string, completed: boolean) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
}

export const useGoalsStore = create<GoalsStore>((set, get) => ({
  goals: [],
  loaded: false,

  async load() {
    const goals = await db.goals.toArray();
    // Sort: active first (oldest startDate first), then completed at the
    // bottom. Within active, no-deadline goals sink to the end so dated
    // goals dominate the visible top of the list.
    goals.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (!!a.targetDate !== !!b.targetDate) return a.targetDate ? -1 : 1;
      const ad = a.targetDate ?? '9999';
      const bd = b.targetDate ?? '9999';
      return ad.localeCompare(bd);
    });
    set({ goals: goals.filter((g) => !g.deletedAt), loaded: true });
  },

  async addGoal(g) {
    const now = new Date().toISOString();
    const goal: Goal = {
      ...g,
      id: generateId(),
      completed: false,
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await db.goals.add(goal);
    await enqueue('goal', goal.id, 'insert', goal);
    await get().load();
  },

  async updateGoal(id, patch) {
    const existing = await db.goals.get(id);
    if (!existing) return;
    const updated: Goal = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await db.goals.put(updated);
    await enqueue('goal', id, 'update', updated);
    await get().load();
  },

  async markCompleted(id, completed) {
    await get().updateGoal(id, {
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    });
  },

  async deleteGoal(id) {
    // Soft-delete via deletedAt so the row syncs as a tombstone and other
    // devices stop showing it. Local rows are filtered out in load().
    await get().updateGoal(id, { deletedAt: new Date().toISOString() });
    await db.goals.delete(id);
    await enqueue('goal', id, 'delete', { id });
    await get().load();
  },
}));
