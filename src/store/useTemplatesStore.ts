// Smart Templates store — holds the most recent detection result and lets
// any component subscribe. Refresh runs on app open (from AppShell) and after
// any write to the affected entity (transactions / workout sets / tasks),
// keeping the chips in sync without manual invalidation calls scattered
// through the codebase.
//
// All in-memory; persistence isn't needed because detection is cheap and
// the source data (Dexie) is already persistent.

import { create } from 'zustand';
import { detectAllTemplates } from '../lib/templates';
import type {
  QuickTemplates,
  TransactionTemplate,
  WorkoutTemplate,
  TaskTemplate,
} from '../types/templates';

interface TemplatesStore extends QuickTemplates {
  loading: boolean;
  lastRefreshAt: number | null;
  refresh: () => Promise<void>;
}

const EMPTY: QuickTemplates = {
  transactions: [],
  workouts: [],
  tasks: [],
};

export const useTemplatesStore = create<TemplatesStore>((set) => ({
  ...EMPTY,
  loading: false,
  lastRefreshAt: null,

  async refresh() {
    set({ loading: true });
    try {
      const result = await detectAllTemplates();
      set({
        transactions: result.transactions,
        workouts: result.workouts,
        tasks: result.tasks,
        loading: false,
        lastRefreshAt: Date.now(),
      });
    } catch {
      // Detection should never throw, but if Dexie has a transient issue
      // we don't want to wedge the UI — keep last good templates visible.
      set({ loading: false });
    }
  },
}));

// Re-export the template item types so consumers don't need to import from
// two paths when both the store and the types are involved.
export type { TransactionTemplate, WorkoutTemplate, TaskTemplate };
