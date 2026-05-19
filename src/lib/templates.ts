// Smart Templates · Pattern Detection
// ----------------------------------------------------------------------------
// Walks the local Dexie tables and extracts recurring patterns the user is
// likely to want to one-tap-log again. All detection is local (no server),
// runs on app open, and is cheap enough to recompute each time (handful of
// ms for typical personal-app data volumes).
//
// Ranking: frequency-first, then recency. We do NOT compute a multiplicative
// decay — for a personal app the top of the list is usually obvious from raw
// frequency, and the decay heuristic added complexity without changing UX.
//
// Detection windows:
//   - Transactions: last 90 days (covers monthly recurring + occasional)
//   - Workouts:     last 60 days (long enough for varied weeks, short enough
//                                  to exclude "I tried this once in March")
//   - Tasks:        last 90 days, prefix-match (tasks are often near-unique;
//                                  we cluster by first 3 words)

import { db } from '../db/database';
import type {
  TransactionTemplate,
  WorkoutTemplate,
  TaskTemplate,
  QuickTemplates,
} from '../types/templates';

const TX_WINDOW_DAYS = 90;
const WORKOUT_WINDOW_DAYS = 60;
const TASK_WINDOW_DAYS = 90;

const TX_MIN_OCCURRENCES = 2;
const WORKOUT_MIN_OCCURRENCES = 2;
const TASK_MIN_OCCURRENCES = 2;

const TX_TOP_N = 6;
const WORKOUT_TOP_N = 6;
const TASK_TOP_N = 4;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Normalize text for grouping: lowercase, collapse whitespace, drop trailing
 *  numbers/dates so "Lidl 12.5" and "Lidl 14.3" group together. */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\d.,\-/]+$/g, '')
    .trim();
}

/** First N words of a string — for clustering similar task titles. */
function prefix(s: string, n: number): string {
  return s.toLowerCase().split(/\s+/).slice(0, n).join(' ');
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mode<T>(items: T[]): T | undefined {
  if (!items.length) return undefined;
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const x of items) {
    const c = (counts.get(x) ?? 0) + 1;
    counts.set(x, c);
    if (c > bestCount) {
      bestCount = c;
      best = x;
    }
  }
  return best;
}

// ── Transactions ───────────────────────────────────────────────────────────

export async function detectTransactionTemplates(): Promise<TransactionTemplate[]> {
  const cutoff = daysAgo(TX_WINDOW_DAYS).toISOString().slice(0, 10);
  const all = await db.transactions.where('date').aboveOrEqual(cutoff).toArray();

  // Group by (normalized description, type). Capture amount distribution and
  // most common category so the template restores the user's typical setup.
  type Group = {
    description: string;
    type: typeof all[number]['type'];
    amounts: number[];
    categories: (string | undefined)[];
    dates: string[];
  };
  const groups = new Map<string, Group>();

  for (const t of all) {
    const norm = normalizeText(t.description);
    if (!norm) continue;
    const key = `${t.type}|${norm}`;
    const g = groups.get(key) ?? {
      description: t.description.trim(), // keep the *original casing* of the most recent example below
      type: t.type,
      amounts: [],
      categories: [],
      dates: [],
    };
    g.amounts.push(t.amount);
    g.categories.push(t.categoryId);
    g.dates.push(t.date);
    // Refresh display description to the most recent example so we render
    // a current-looking string rather than a 3-month-old version.
    g.description = t.description.trim();
    groups.set(key, g);
  }

  const templates: TransactionTemplate[] = [];
  for (const [key, g] of groups) {
    if (g.amounts.length < TX_MIN_OCCURRENCES) continue;
    const amount = Math.round(median(g.amounts) * 100) / 100;
    const categoryId = mode(g.categories.filter((c): c is string => !!c));
    // [...].sort().pop() instead of .at(-1) — the latter requires ES2022 lib
    // which the build tsconfig doesn't target. Spread copies so sort+pop
    // don't mutate the source array.
    const lastUsed = [...g.dates].sort().pop() ?? '';
    templates.push({
      id: `tx:${key}`,
      description: g.description,
      amount,
      type: g.type,
      categoryId,
      frequency: g.amounts.length,
      lastUsed,
    });
  }

  return rankAndTake(templates, TX_TOP_N);
}

// ── Workouts ──────────────────────────────────────────────────────────────

export async function detectWorkoutTemplates(): Promise<WorkoutTemplate[]> {
  const cutoff = daysAgo(WORKOUT_WINDOW_DAYS).toISOString().slice(0, 10);
  const sessions = await db.workoutSessions.where('date').aboveOrEqual(cutoff).toArray();
  const sessionIds = sessions.map((s) => s.id);
  if (!sessionIds.length) return [];

  const sets = await db.workoutSets.where('sessionId').anyOf(sessionIds).toArray();

  // Group by exercise. Within each exercise, find the most common (weight, reps)
  // combo so the chip pre-fills the user's "default" working set, not whatever
  // ad-hoc heavy single they tried once.
  type SetKey = string; // `${exercise}|${weight}|${reps}`
  type ExGroup = {
    exercise: string;
    combos: Map<SetKey, { weight?: number; reps?: number; count: number; lastDate: string }>;
    total: number;
  };
  const groups = new Map<string, ExGroup>();
  const sessionDateById = new Map(sessions.map((s) => [s.id, s.date]));

  for (const s of sets) {
    const ex = s.exercise.trim();
    if (!ex || s.reps == null) continue;
    const exKey = ex.toLowerCase();
    const g = groups.get(exKey) ?? { exercise: ex, combos: new Map(), total: 0 };
    const comboKey: SetKey = `${exKey}|${s.weightKg ?? ''}|${s.reps}`;
    const existing = g.combos.get(comboKey);
    const sessionDate = sessionDateById.get(s.sessionId) ?? '';
    if (existing) {
      existing.count++;
      if (sessionDate > existing.lastDate) existing.lastDate = sessionDate;
    } else {
      g.combos.set(comboKey, {
        weight: s.weightKg,
        reps: s.reps,
        count: 1,
        lastDate: sessionDate,
      });
    }
    g.total++;
    g.exercise = ex;
    groups.set(exKey, g);
  }

  const templates: WorkoutTemplate[] = [];
  for (const [exKey, g] of groups) {
    if (g.total < WORKOUT_MIN_OCCURRENCES) continue;
    // Pick the most-frequent combo for this exercise; tie-break by recency.
    const sorted = [...g.combos.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.lastDate.localeCompare(a.lastDate);
    });
    const top = sorted[0];
    templates.push({
      id: `wk:${exKey}|${top.weight ?? ''}|${top.reps}`,
      exercise: g.exercise,
      weightKg: top.weight,
      reps: top.reps,
      frequency: g.total,
      lastUsed: top.lastDate,
    });
  }

  return rankAndTake(templates, WORKOUT_TOP_N);
}

// ── Tasks ─────────────────────────────────────────────────────────────────

export async function detectTaskTemplates(): Promise<TaskTemplate[]> {
  const cutoff = daysAgo(TASK_WINDOW_DAYS).toISOString();
  const all = await db.tasks.where('createdAt').aboveOrEqual(cutoff).toArray();

  // Tasks are usually unique by exact title, so we cluster by the first 3
  // words ("Pay rent", "Pay rent april" → same prefix). For each cluster
  // we pick the most recent full title as the surfaced template.
  type Group = {
    title: string;
    lastCreatedAt: string;
    priority: typeof all[number]['priority'];
    category: typeof all[number]['category'];
    count: number;
  };
  const groups = new Map<string, Group>();

  for (const t of all) {
    if (!t.title.trim()) continue;
    const key = prefix(t.title, 3);
    if (!key) continue;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (t.createdAt > g.lastCreatedAt) {
        g.lastCreatedAt = t.createdAt;
        g.title = t.title.trim();
        g.priority = t.priority;
        g.category = t.category;
      }
    } else {
      groups.set(key, {
        title: t.title.trim(),
        lastCreatedAt: t.createdAt,
        priority: t.priority,
        category: t.category,
        count: 1,
      });
    }
  }

  const templates: TaskTemplate[] = [];
  for (const [key, g] of groups) {
    if (g.count < TASK_MIN_OCCURRENCES) continue;
    templates.push({
      id: `tk:${key}`,
      title: g.title,
      priority: g.priority,
      category: g.category,
      frequency: g.count,
      lastUsed: g.lastCreatedAt,
    });
  }

  return rankAndTake(templates, TASK_TOP_N);
}

// ── Public entry point ────────────────────────────────────────────────────

export async function detectAllTemplates(): Promise<QuickTemplates> {
  // Run in parallel; each touches a different Dexie table.
  const [transactions, workouts, tasks] = await Promise.all([
    detectTransactionTemplates(),
    detectWorkoutTemplates(),
    detectTaskTemplates(),
  ]);
  return { transactions, workouts, tasks };
}

// ── Internals ─────────────────────────────────────────────────────────────

function rankAndTake<T extends { frequency: number; lastUsed: string }>(
  items: T[],
  n: number,
): T[] {
  return items
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return b.lastUsed.localeCompare(a.lastUsed);
    })
    .slice(0, n);
}
