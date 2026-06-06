// ─── v1.2 Savings Goals store ────────────────────────────────────────────
//
// Local-only for v1.2 (no cloud sync — the v1 entityType union doesn't
// include 'savings_goal'). Goals live in Dexie v9's `savingsGoals` table.
// A future v1.3 work item adds the kind to the cloud syncQueue once we
// decide whether savings goals are personal-only or shareable.
//
// Business rules enforced in the store (not the UI):
//   - `allocatedAmount` clamps at 0 — can't go negative.
//   - When `allocatedAmount` first reaches `targetAmount`, stamp
//     `completedAt`. Allocating BACK below target clears `completedAt` so
//     re-completion stamps a fresh timestamp.
//   - Soft-delete via `deletedAt` to keep parity with the v1.x sync pattern;
//     load() filters tombstones from the visible list. Even though there's
//     no cloud sync today, this means a future flip-to-sync doesn't need a
//     data migration to introduce soft-delete.
//
// Cross-currency note: the goal's `currency` is captured at creation. The
// store does NOT convert allocations between currencies — the goal carries
// its own currency and the UI handles cross-currency math when computing
// "available cash" against the user's baseCurrency.

import { create } from 'zustand';
import { db } from '../db/database';
import type { SavingsGoal } from '../types/finance';
import { generateId } from '../utils/uuid';

interface SavingsGoalsStore {
  goals: SavingsGoal[];
  loaded: boolean;

  load: () => Promise<void>;
  addGoal: (
    g: Omit<
      SavingsGoal,
      'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'allocatedAmount' | 'completedAt' | 'deletedAt'
    > & { allocatedAmount?: number },
  ) => Promise<void>;
  updateGoal: (
    id: string,
    patch: Partial<Omit<SavingsGoal, 'id' | 'createdAt' | 'syncStatus'>>,
  ) => Promise<void>;
  /** Increment (positive) or decrement (negative) the allocated amount.
   *  Clamps at 0. Auto-completes when reaching target; un-completes when
   *  dropping back below. */
  allocate: (id: string, delta: number) => Promise<void>;
  /** Replace the allocated amount with an absolute number. Same auto-
   *  complete behavior as allocate(). Useful when the UI edits via a
   *  text input rather than +/- buttons. */
  setAllocated: (id: string, amount: number) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  /**
   * v1.2 follow-up — BUG-5. Idempotent: ensures exactly one buffer goal
   * exists. If absent, creates one. On first creation, migrates the legacy
   * `useSettingsStore.savingsBufferAmount` value (if > 0) into the new
   * goal's `allocatedAmount` so existing users don't lose their reserve.
   * Safe to call multiple times — short-circuits when a buffer already exists.
   */
  ensureBufferGoal: (opts?: { migrateAmount?: number; currency?: string }) => Promise<void>;
}

function sortGoals(goals: SavingsGoal[]): SavingsGoal[] {
  // v1.2 follow-up — BUG-5. Buffer goal ALWAYS sorts to the top of the list,
  // ahead of even active goals. Visual primacy reflects its singleton-pinned
  // role; user reads "Emergency Buffer" before scanning their other goals.
  // Otherwise: active first (no deadline last among active, dated soonest
  // first within active), completed at the bottom.
  return [...goals].sort((a, b) => {
    if (!!a.isBuffer !== !!b.isBuffer) return a.isBuffer ? -1 : 1;
    const aCompleted = !!a.completedAt;
    const bCompleted = !!b.completedAt;
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
    if (!!a.deadline !== !!b.deadline) return a.deadline ? -1 : 1;
    const ad = a.deadline ?? '9999';
    const bd = b.deadline ?? '9999';
    if (ad !== bd) return ad.localeCompare(bd);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export const useSavingsGoalsStore = create<SavingsGoalsStore>((set, get) => ({
  goals: [],
  loaded: false,

  async load() {
    const rows = await db.savingsGoals.toArray();
    set({ goals: sortGoals(rows.filter((g) => !g.deletedAt)), loaded: true });
  },

  async addGoal(input) {
    const now = new Date().toISOString();
    const allocated = Math.max(0, input.allocatedAmount ?? 0);
    const goal: SavingsGoal = {
      id: generateId(),
      title: input.title,
      targetAmount: Math.max(0, input.targetAmount),
      currency: input.currency,
      allocatedAmount: allocated,
      deadline: input.deadline,
      notes: input.notes,
      completedAt: allocated >= input.targetAmount && input.targetAmount > 0 ? now : undefined,
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await db.savingsGoals.add(goal);
    set({ goals: sortGoals([...get().goals, goal]) });
  },

  async updateGoal(id, patch) {
    const existing = await db.savingsGoals.get(id);
    if (!existing) return;
    // Recompute completedAt on every update — if target changes downward and
    // allocated now meets it, auto-complete; if target rises above allocated,
    // un-complete.
    const merged: SavingsGoal = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    // v1.2 follow-up — BUG-5. Buffer goal is a continuous reserve, not a
    // one-shot goal. Allocating up to or beyond `targetAmount` should NOT
    // stamp `completedAt` (and any stale stamp gets cleared) — completing
    // the buffer is a meaningless state.
    if (merged.isBuffer) {
      merged.completedAt = undefined;
    } else {
      const reached = merged.allocatedAmount >= merged.targetAmount && merged.targetAmount > 0;
      if (reached && !merged.completedAt) merged.completedAt = merged.updatedAt;
      if (!reached && merged.completedAt) merged.completedAt = undefined;
    }
    await db.savingsGoals.put(merged);
    set({
      goals: sortGoals(get().goals.map((g) => (g.id === id ? merged : g))),
    });
  },

  async allocate(id, delta) {
    const existing = await db.savingsGoals.get(id);
    if (!existing) return;
    const next = Math.max(0, existing.allocatedAmount + delta);
    await get().setAllocated(id, next);
  },

  async setAllocated(id, amount) {
    const existing = await db.savingsGoals.get(id);
    if (!existing) return;
    const clamped = Math.max(0, isFinite(amount) ? amount : 0);
    await get().updateGoal(id, { allocatedAmount: clamped });
  },

  async deleteGoal(id) {
    // Soft-delete tombstone first (so a future sync sees the deletion),
    // then physical delete on the local table since we don't actually
    // ship the tombstone anywhere today.
    const existing = await db.savingsGoals.get(id);
    if (!existing) return;
    // v1.2 follow-up — BUG-5. Buffer goal is non-deletable to keep the
    // "single source of truth" guarantee intact (deleting it would silently
    // re-enable the legacy duplicate-savings concept). UI already hides the
    // delete button for buffer; this is belt-and-braces against callers
    // that bypass the UI (future sync replay, debug tools, etc.).
    if (existing.isBuffer) {
      console.warn('[savings] refusing to delete buffer goal', id);
      return;
    }
    const tombstoned: SavingsGoal = {
      ...existing,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    await db.savingsGoals.put(tombstoned);
    // For v1.2 we also physically remove since there's no cloud round-trip
    // to coordinate. When sync lands in v1.3, drop this physical-delete and
    // let the tombstone ride out.
    await db.savingsGoals.delete(id);
    set({ goals: get().goals.filter((g) => g.id !== id) });
  },

  async ensureBufferGoal(opts) {
    // Idempotent — short-circuit if a buffer goal already exists.
    const existing = get().goals.find((g) => g.isBuffer);
    if (existing) return;
    const now = new Date().toISOString();
    const initialAllocated = Math.max(0, opts?.migrateAmount ?? 0);
    const goal: SavingsGoal = {
      id: generateId(),
      title: 'Emergency Buffer',
      // Default target: same as initial allocated. User can adjust later in
      // the goal editor. We deliberately don't pick an opinionated default
      // (3× monthly expenses, etc.) — Net Worth's runway card surfaces
      // that math separately.
      targetAmount: initialAllocated,
      currency: opts?.currency ?? 'USD',
      allocatedAmount: initialAllocated,
      // Buffer goal explicitly has no deadline / notes — those are owned
      // properties for regular goals only.
      isBuffer: true,
      // Don't stamp `completedAt` even if allocated == target — the buffer
      // is a continuous reserve, not a one-shot goal. Completing it would
      // confuse the user ("I already finished my buffer? But I still want
      // it…").
      completedAt: undefined,
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await db.savingsGoals.add(goal);
    set({ goals: sortGoals([...get().goals, goal]) });
  },
}));
