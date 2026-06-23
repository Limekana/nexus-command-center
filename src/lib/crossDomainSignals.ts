// ─── v1.2 Cross-Domain Insights signal engine ───────────────────────────
//
// Pure functions that correlate already-collected data across the four
// domains (Fitness, Studies, Finance, Habits) into actionable observations.
// No new schema — everything is derived from existing Dexie tables.
//
// Design principles:
//   1. No causation claims. Observations are correlations + comparisons,
//      framed as patterns the user can decide what to do with. "On weeks
//      you trained 3+ times, you studied 27% more" — NOT "training causes
//      better study output."
//   2. 4-week baseline gate. Below 4 weeks of any input we don't show
//      observations from that stream — too small a sample. The composite
//      life score also gates at 4 weeks.
//   3. Weekly buckets (Mon-Sun ISO week). All comparisons happen at the
//      week granularity to smooth day-to-day noise.
//   4. Pure functions — every helper takes its inputs explicitly and
//      returns a plain object. Easy to test, no React-tree coupling.
//
// Inputs flow in from the store selectors (useFitnessStore.sessions,
// useStudiesStore.studySessions, useFinanceStore.transactions + budgets,
// useHabitsStore.habits + completions). The consumer (dashboard card +
// /life screen) orchestrates the call.

import type { WorkoutSession } from '../types/fitness';
import type { StudySession } from '../types/studies';
import type { Transaction, BudgetCategory } from '../types/finance';
import type { Habit, HabitCompletion } from '../types/habits';
import { isEligibleOn, dateKey } from './habitStreaks';
import { type LifeProfile, type DomainKey } from './lifeProfile';

// ─── Week bucketing ─────────────────────────────────────────────────────

/** Anchor a date to its Monday (ISO week start) at local midnight.
 *  Returns a new Date — does not mutate. Sunday is rolled to the previous
 *  Monday so the week label feels natural. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay(); // 0 Sun .. 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow; // shift to Monday
  out.setDate(out.getDate() + delta);
  return out;
}

/** Stable key for a week — YYYY-MM-DD of the Monday. */
export function weekKey(d: Date): string {
  return dateKey(startOfWeek(d));
}

/** Generate the last N week-start dates (most recent first). */
export function lastNWeeks(n: number, today: Date = new Date()): Date[] {
  const out: Date[] = [];
  const cursor = startOfWeek(today);
  for (let i = 0; i < n; i++) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i * 7);
    out.push(d);
  }
  return out;
}

// ─── Weekly aggregates per domain ───────────────────────────────────────

export interface WeeklyFitness {
  weekStart: string;       // YYYY-MM-DD Monday
  sessionsCount: number;
  totalSetCount: number;
  trainingDays: Set<string>; // YYYY-MM-DD of days that had a workout
}

export interface WeeklyStudy {
  weekStart: string;
  totalMinutes: number;
  sessionCount: number;
  /** Minutes on days that ALSO had a workout vs days without. Used by the
   *  "study output on workout days vs rest days" comparison. */
  minutesOnWorkoutDays: number;
  minutesOnRestDays: number;
}

export interface WeeklyFinance {
  weekStart: string;
  /** Sum of expenses across the week. Income is excluded — we're comparing
   *  spending patterns, not net cashflow. */
  expenseTotal: number;
  /** Adherence ratio: actual / proportional weekly budget. 1.0 = exactly
   *  on track, <1 = under budget, >1 = over. Computed against monthly
   *  budget × 7/30. */
  budgetAdherence: number | null;
}

export interface WeeklyHabits {
  weekStart: string;
  /** Total eligible (habit, date) pairs in the week. */
  eligibleCount: number;
  /** Of those, how many were "hit" (binary present OR quantified ≥target). */
  hitCount: number;
  /** Hit ratio in [0..1]. null if no eligibility this week. */
  hitRatio: number | null;
}

function inWeek(date: Date, weekStart: Date): boolean {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return date >= weekStart && date < end;
}

export function bucketFitnessByWeek(
  sessions: WorkoutSession[],
  weeks: Date[],
): WeeklyFitness[] {
  return weeks.map((w) => {
    const inThisWeek = sessions.filter((s) => inWeek(new Date(s.date), w));
    const trainingDays = new Set(inThisWeek.map((s) => s.date.slice(0, 10)));
    return {
      weekStart: dateKey(w),
      sessionsCount: inThisWeek.length,
      totalSetCount: inThisWeek.reduce((sum, s) => sum + (s.sets?.length ?? 0), 0),
      trainingDays,
    };
  });
}

export function bucketStudyByWeek(
  sessions: StudySession[],
  weeks: Date[],
  fitnessWeeks: WeeklyFitness[],
): WeeklyStudy[] {
  return weeks.map((w, idx) => {
    const inThisWeek = sessions.filter((s) => inWeek(new Date(s.startedAt), w));
    const workoutDays = fitnessWeeks[idx]?.trainingDays ?? new Set<string>();
    let minutesOnWorkoutDays = 0;
    let minutesOnRestDays = 0;
    for (const s of inThisWeek) {
      const day = s.startedAt.slice(0, 10);
      if (workoutDays.has(day)) minutesOnWorkoutDays += s.durationMinutes;
      else minutesOnRestDays += s.durationMinutes;
    }
    return {
      weekStart: dateKey(w),
      totalMinutes: inThisWeek.reduce((sum, s) => sum + s.durationMinutes, 0),
      sessionCount: inThisWeek.length,
      minutesOnWorkoutDays,
      minutesOnRestDays,
    };
  });
}

export function bucketFinanceByWeek(
  txns: Transaction[],
  budgets: BudgetCategory[],
  weeks: Date[],
): WeeklyFinance[] {
  const monthlyBudgetTotal = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  // Proportional weekly budget. 7 days / 30-day month is a deliberate
  // approximation — real calendar months are 28-31 days. Close enough for
  // a weekly trend pill; we'd over-engineer to compute the exact month
  // each week falls in.
  const proportionalWeekly = monthlyBudgetTotal * (7 / 30);
  return weeks.map((w) => {
    const inThisWeek = txns.filter(
      (t) => t.type === 'expense' && inWeek(new Date(t.date), w),
    );
    const expenseTotal = inThisWeek.reduce((sum, t) => sum + t.amount, 0);
    const budgetAdherence =
      proportionalWeekly > 0 ? expenseTotal / proportionalWeekly : null;
    return {
      weekStart: dateKey(w),
      expenseTotal,
      budgetAdherence,
    };
  });
}

export function bucketHabitsByWeek(
  habits: Habit[],
  completions: HabitCompletion[],
  weeks: Date[],
): WeeklyHabits[] {
  // Pre-index completions by (habitId, date) for O(1) lookup. The completion
  // count is small (low-hundreds for a typical user) so a Map is overkill
  // but keeps the helper future-proof.
  const completionsByKey = new Map<string, number>();
  for (const c of completions) {
    completionsByKey.set(`${c.habitId}:${c.date}`, c.amount);
  }

  return weeks.map((w) => {
    let eligibleCount = 0;
    let hitCount = 0;
    // Walk each day of this week × each active habit.
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const day = new Date(w);
      day.setDate(day.getDate() + dayOffset);
      const dayK = dateKey(day);
      for (const h of habits) {
        if (h.archivedAt) continue;
        // Don't count days that predate the habit's creation.
        if (day.toISOString() < h.createdAt) continue;
        if (!isEligibleOn(h, day)) continue;
        eligibleCount += 1;
        const amount = completionsByKey.get(`${h.id}:${dayK}`) ?? 0;
        const target = h.type === 'binary' ? 1 : Math.max(1, h.targetAmount ?? 1);
        if (amount >= target) hitCount += 1;
      }
    }
    return {
      weekStart: dateKey(w),
      eligibleCount,
      hitCount,
      hitRatio: eligibleCount > 0 ? hitCount / eligibleCount : null,
    };
  });
}

// ─── Insight observations ───────────────────────────────────────────────

export interface Insight {
  /** Stable key for animation / dedupe — observations rotate through this
   *  on the dashboard, so a stable id keeps the same one from cycling
   *  back-to-back. */
  id: string;
  domain: 'fitness-study' | 'fitness-finance' | 'habits-output' | 'life-score';
  /** Short headline shown big on the card. */
  headline: string;
  /** Supporting line — the "27%" / "3 of 4 weeks" detail. */
  detail: string;
  /** Polarity for tint — positive (success), negative (warning/danger),
   *  neutral (text-muted). Drives the icon/color on the card. */
  tone: 'positive' | 'negative' | 'neutral';
}

const MIN_WEEKS = 4;

/** Fitness × Studies. Compare avg study minutes on workout days vs rest
 *  days across the last MIN_WEEKS weeks. Surface only if the delta is
 *  meaningful (≥15%). */
export function fitnessStudyInsight(
  studyWeeks: WeeklyStudy[],
): Insight | null {
  const recent = studyWeeks.slice(0, MIN_WEEKS);
  if (recent.length < MIN_WEEKS) return null;
  const totalWorkoutDayMin = recent.reduce((s, w) => s + w.minutesOnWorkoutDays, 0);
  const totalRestDayMin = recent.reduce((s, w) => s + w.minutesOnRestDays, 0);
  // Need a baseline of activity in both buckets to compare meaningfully.
  if (totalWorkoutDayMin < 30 || totalRestDayMin < 30) return null;
  const delta = (totalWorkoutDayMin - totalRestDayMin) / Math.max(totalRestDayMin, 1);
  if (Math.abs(delta) < 0.15) return null;
  const pct = Math.abs(Math.round(delta * 100));
  if (delta > 0) {
    return {
      id: 'fs-workout-up',
      domain: 'fitness-study',
      headline: `You study ${pct}% more on workout days`,
      detail: `Over the last ${MIN_WEEKS} weeks · ${Math.round(totalWorkoutDayMin)}m vs ${Math.round(totalRestDayMin)}m`,
      tone: 'positive',
    };
  }
  return {
    id: 'fs-workout-down',
    domain: 'fitness-study',
    headline: `You study ${pct}% less on workout days`,
    detail: `Over the last ${MIN_WEEKS} weeks · ${Math.round(totalWorkoutDayMin)}m vs ${Math.round(totalRestDayMin)}m`,
    tone: 'neutral',
  };
}

/** Fitness × Finance. Spending in high-training weeks (3+ sessions) vs
 *  low-training weeks (≤1 session). */
export function fitnessFinanceInsight(
  fitnessWeeks: WeeklyFitness[],
  financeWeeks: WeeklyFinance[],
): Insight | null {
  if (fitnessWeeks.length < MIN_WEEKS) return null;
  const highWeeks: number[] = [];
  const lowWeeks: number[] = [];
  for (let i = 0; i < fitnessWeeks.length; i++) {
    const f = fitnessWeeks[i];
    const $ = financeWeeks[i];
    if (!$) continue;
    if (f.sessionsCount >= 3) highWeeks.push($.expenseTotal);
    else if (f.sessionsCount <= 1) lowWeeks.push($.expenseTotal);
  }
  if (highWeeks.length < 2 || lowWeeks.length < 2) return null;
  const avgHigh = highWeeks.reduce((s, x) => s + x, 0) / highWeeks.length;
  const avgLow = lowWeeks.reduce((s, x) => s + x, 0) / lowWeeks.length;
  if (avgHigh === 0 && avgLow === 0) return null;
  const denom = Math.max(avgLow, 1);
  const delta = (avgHigh - avgLow) / denom;
  if (Math.abs(delta) < 0.15) return null;
  const pct = Math.abs(Math.round(delta * 100));
  return {
    id: delta > 0 ? 'ff-high-spend' : 'ff-low-spend',
    domain: 'fitness-finance',
    headline:
      delta > 0
        ? `You spend ${pct}% more in high-training weeks`
        : `You spend ${pct}% less in high-training weeks`,
    detail: `${highWeeks.length} high-training weeks vs ${lowWeeks.length} low-training weeks`,
    tone: delta > 0 ? 'negative' : 'positive',
  };
}

/** Habits × Fitness/Study output. Compare study minutes + workout sessions
 *  in weeks with high habit-hit ratio vs low. Threshold = top vs bottom
 *  half of the 4-week window. */
export function habitsOutputInsight(
  habitWeeks: WeeklyHabits[],
  studyWeeks: WeeklyStudy[],
  fitnessWeeks: WeeklyFitness[],
): Insight | null {
  const valid = habitWeeks
    .map((h, i) => ({ h, study: studyWeeks[i], fit: fitnessWeeks[i] }))
    .filter((x) => x.h.hitRatio != null && x.h.eligibleCount >= 3);
  if (valid.length < MIN_WEEKS) return null;
  const sorted = [...valid].sort((a, b) => (b.h.hitRatio! - a.h.hitRatio!));
  const half = Math.floor(sorted.length / 2);
  const top = sorted.slice(0, half);
  const bottom = sorted.slice(-half);
  if (top.length < 2 || bottom.length < 2) return null;

  const avgStudyTop = top.reduce((s, x) => s + x.study.totalMinutes, 0) / top.length;
  const avgStudyBottom = bottom.reduce((s, x) => s + x.study.totalMinutes, 0) / bottom.length;
  const avgFitTop = top.reduce((s, x) => s + x.fit.sessionsCount, 0) / top.length;
  const avgFitBottom = bottom.reduce((s, x) => s + x.fit.sessionsCount, 0) / bottom.length;

  // Pick whichever delta is more interesting (largest magnitude).
  const studyDelta = avgStudyBottom > 0
    ? (avgStudyTop - avgStudyBottom) / avgStudyBottom : 0;
  const fitDelta = avgFitBottom > 0
    ? (avgFitTop - avgFitBottom) / avgFitBottom : 0;
  if (Math.abs(studyDelta) < 0.15 && Math.abs(fitDelta) < 0.15) return null;
  const useStudy = Math.abs(studyDelta) >= Math.abs(fitDelta);
  const delta = useStudy ? studyDelta : fitDelta;
  const pct = Math.abs(Math.round(delta * 100));
  const target = useStudy ? 'study more' : 'train more often';
  return {
    id: useStudy ? 'ho-study' : 'ho-train',
    domain: 'habits-output',
    headline: `Hit your habits, ${target}`,
    detail:
      delta > 0
        ? `${pct}% ${useStudy ? 'more study time' : 'more sessions'} in your best habit weeks`
        : `${pct}% ${useStudy ? 'less study time' : 'fewer sessions'} in your best habit weeks`,
    tone: delta > 0 ? 'positive' : 'neutral',
  };
}

// ─── Weekly composite life score ────────────────────────────────────────

export interface LifeScore {
  weekStart: string;
  /** 0..100 composite. */
  score: number;
  /** Sub-scores (each 0..100) used to render the breakdown ring. */
  workouts: number;
  study: number;
  habits: number;
  budget: number;
  /** v1.5 — Work domain (0..100). 0 when no self-assessment data. */
  work: number;
}

/** Maps a LifeProfile domain key to its computed sub-score field. */
const DOMAIN_TO_SUBSCORE: Record<DomainKey, keyof Pick<LifeScore, 'workouts' | 'study' | 'habits' | 'budget' | 'work'>> = {
  finance: 'budget',
  fitness: 'workouts',
  studies: 'study',
  work: 'work',
  habits: 'habits',
};

/**
 * Weighted composite. Each component normalizes to 0..100 against a target.
 *
 * Targets (chosen to feel attainable but not trivial):
 *   - workouts: 3 sessions/week → 100
 *   - study   : 240 minutes/week → 100
 *   - habits  : hit ratio 80% → 100
 *   - budget  : adherence ratio ≤ 1.0 → 100, 1.2 → 0 (linear between)
 *   - work    : supplied by computeWorkScore (opts.workScore), 0 when absent
 *
 * Weighting:
 *   - Default (no profile): equal weight across the four legacy domains
 *     (workouts/study/habits/budget) — preserves pre-v1.5 behaviour, Work
 *     excluded.
 *   - With a profile: weighted across the profile's ENABLED domains. An
 *     enabled domain with no data scores 0 and counts toward the denominator
 *     (intentional — same as Studies reading 0 when StudyDesk has no data).
 */
export function lifeScoreForWeek(
  fit: WeeklyFitness,
  study: WeeklyStudy,
  fin: WeeklyFinance,
  habits: WeeklyHabits,
  opts?: { workScore?: number; profile?: LifeProfile },
): LifeScore {
  const workouts = Math.min(100, (fit.sessionsCount / 3) * 100);
  const studyScore = Math.min(100, (study.totalMinutes / 240) * 100);
  const habitsScore = habits.hitRatio != null ? habits.hitRatio * 100 : 50;
  let budget = 50; // default mid when no budgets set
  if (fin.budgetAdherence != null) {
    if (fin.budgetAdherence <= 1.0) budget = 100;
    else if (fin.budgetAdherence >= 1.2) budget = 0;
    else budget = 100 * (1 - (fin.budgetAdherence - 1.0) / 0.2);
  }
  const work = Math.min(100, Math.max(0, opts?.workScore ?? 0));

  const sub = {
    workouts: Math.round(workouts),
    study: Math.round(studyScore),
    habits: Math.round(habitsScore),
    budget: Math.round(budget),
    work: Math.round(work),
  };

  let score: number;
  if (opts?.profile) {
    let total = 0;
    let weightSum = 0;
    for (const key of Object.keys(opts.profile.domains) as DomainKey[]) {
      const w = opts.profile.domains[key];
      if (w <= 0) continue;
      total += sub[DOMAIN_TO_SUBSCORE[key]] * w;
      weightSum += w;
    }
    score = weightSum > 0 ? Math.round(total / weightSum) : 0;
  } else {
    score = Math.round((workouts + studyScore + habitsScore + budget) / 4);
  }

  return {
    weekStart: fit.weekStart,
    score,
    ...sub,
  };
}

// ─── Orchestrator — pull everything together ────────────────────────────

export interface CrossDomainReport {
  /** True when there's enough data (≥4 weeks) to surface any observation. */
  ready: boolean;
  /** All weekly buckets for both the dashboard rotator + /life screen. */
  weeks: {
    fitness: WeeklyFitness[];
    study: WeeklyStudy[];
    finance: WeeklyFinance[];
    habits: WeeklyHabits[];
    lifeScores: LifeScore[];
  };
  /** Ranked observations — most interesting first. */
  insights: Insight[];
}

export function buildCrossDomainReport(
  workouts: WorkoutSession[],
  studies: StudySession[],
  txns: Transaction[],
  budgets: BudgetCategory[],
  habits: Habit[],
  completions: HabitCompletion[],
  weeksWindow: number = 8,
  today: Date = new Date(),
  opts?: { profile?: LifeProfile; currentWorkScore?: number },
): CrossDomainReport {
  const weeks = lastNWeeks(weeksWindow, today);
  const fitness = bucketFitnessByWeek(workouts, weeks);
  const study = bucketStudyByWeek(studies, weeks, fitness);
  const finance = bucketFinanceByWeek(txns, budgets, weeks);
  const habitsW = bucketHabitsByWeek(habits, completions, weeks);
  // The Work self-assessment is a current snapshot — historical work data
  // doesn't exist yet — so only the current week (index 0) gets the real Work
  // score; earlier weeks read 0 (the domain was inactive then). The profile
  // weighting applies to every week for a consistent composite.
  const lifeScores = weeks.map((_, i) =>
    lifeScoreForWeek(fitness[i], study[i], finance[i], habitsW[i], {
      profile: opts?.profile,
      workScore: i === 0 ? opts?.currentWorkScore ?? 0 : 0,
    }),
  );

  // Ready when we have at least 4 weeks of data across the buckets that
  // actually had ANY activity — checking only "≥4 weeks elapsed" was too
  // permissive for brand-new users who installed the app 4 weeks ago but
  // logged nothing.
  const hasActivity = (n: number) =>
    fitness.slice(0, n).some((w) => w.sessionsCount > 0) ||
    study.slice(0, n).some((w) => w.sessionCount > 0) ||
    habitsW.slice(0, n).some((w) => w.eligibleCount > 0);
  const ready = weeks.length >= MIN_WEEKS && hasActivity(MIN_WEEKS);

  const insights: Insight[] = [];
  if (ready) {
    const a = fitnessStudyInsight(study);
    if (a) insights.push(a);
    const b = fitnessFinanceInsight(fitness, finance);
    if (b) insights.push(b);
    const c = habitsOutputInsight(habitsW, study, fitness);
    if (c) insights.push(c);
  }

  return {
    ready,
    weeks: { fitness, study, finance, habits: habitsW, lifeScores },
    insights,
  };
}
