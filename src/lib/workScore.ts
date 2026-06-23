// ─── v1.5 Work domain score ──────────────────────────────────────────────
//
// The Work domain feeds the Life Score (Professional / Custom profiles). It's
// composed from the NCC-native daily self-assessment (work_quality_logs) plus
// two cross-signals already present in NCC: active-goal progress and the
// completion rate of habits the user tags as "work-life".
//
// Pure functions — no React, no Dexie. Inputs come from the store selectors;
// the Life tab + crossDomainSignals orchestrate the call.

import type { WorkQualityLog } from '../types/work';

export interface WorkScoreInput {
  /** 1–5 average across the last 7 days that HAD a log. 0 when none. */
  weeklyRatingAvg: number;
  /** 0–7 distinct days logged in the last 7 days. */
  daysLoggedThisWeek: number;
  /** 0–100: avg progress % across active goals. */
  goalsProgressPct: number;
  /** 0–100: completion % of habits tagged 'work-life'. */
  workLifeHabitsPct: number;
}

/**
 * Returns a 0–100 Work domain score.
 *
 * Weights:
 *   - 50% weekly rating avg (1–5 → 0–100, scaled)
 *   - 20% logging consistency (daysLogged / 5 → 0–100, capped)
 *   - 20% goals progress
 *   - 10% work-life habits
 *
 * If no logs exist for the week the rating + consistency terms are 0, so a
 * Work domain with no self-assessments reads as inactive (parallel to Studies
 * scoring 0 when StudyDesk has no data).
 */
export function computeWorkScore(input: WorkScoreInput): number {
  const avg = clamp(input.weeklyRatingAvg, 0, 5);
  // 1–5 → 0–100; a 0 avg (no logs) stays 0 rather than mapping to -25.
  const ratingScore = avg <= 0 ? 0 : ((avg - 1) / 4) * 100;
  const consistencyScore = Math.min(100, (clamp(input.daysLoggedThisWeek, 0, 7) / 5) * 100);
  const goals = clamp(input.goalsProgressPct, 0, 100);
  const habits = clamp(input.workLifeHabitsPct, 0, 100);
  return Math.round(
    ratingScore * 0.5 +
    consistencyScore * 0.2 +
    goals * 0.2 +
    habits * 0.1,
  );
}

/** Derive the rating + consistency inputs from the raw logs over the trailing
 *  7 days (inclusive of `today`). The goals/habits inputs are supplied by the
 *  caller from their respective stores. */
export function weeklyRatingStats(
  logs: WorkQualityLog[],
  today: Date = new Date(),
): { weeklyRatingAvg: number; daysLoggedThisWeek: number } {
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 6); // 7-day window incl. today
  const cutoffKey = dayKey(cutoff);
  const todayK = dayKey(today);

  // One rating per day already (UNIQUE per day), but de-dupe defensively by
  // keeping the latest-updated row per date.
  const byDay = new Map<string, WorkQualityLog>();
  for (const l of logs) {
    if (l.date < cutoffKey || l.date > todayK) continue;
    const prev = byDay.get(l.date);
    if (!prev || (l.updatedAt ?? '') > (prev.updatedAt ?? '')) byDay.set(l.date, l);
  }

  const inWindow = [...byDay.values()];
  const daysLoggedThisWeek = inWindow.length;
  const weeklyRatingAvg =
    daysLoggedThisWeek > 0
      ? inWindow.reduce((s, l) => s + clamp(l.rating, 1, 5), 0) / daysLoggedThisWeek
      : 0;

  return { weeklyRatingAvg, daysLoggedThisWeek };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
