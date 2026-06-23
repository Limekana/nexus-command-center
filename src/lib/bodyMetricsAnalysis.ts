// ─── v1.3 Body metrics analysis helpers (NCC, read-only) ──────────────────
//
// Pure functions for the Fitness screen's body section. Ported from LimeLog's
// bodyMetricsAnalysis.ts so the two apps compute identical weight trends from
// the same source rows (a user looking at the same data in NCC + LimeLog
// should see the same numbers). No store coupling — every function takes its
// inputs explicitly.

import type { BodyMetric } from '../types/fitness';

/** Weight series — sorted oldest-first, only entries with weight set. */
export interface WeightPoint {
  date: string;
  weightKg: number;
  /** 7-day trailing moving average. null until the 7th eligible entry. */
  ma7: number | null;
}

export function weightSeries(metrics: BodyMetric[]): WeightPoint[] {
  const rows = metrics
    .filter((m) => m.weightKg != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: WeightPoint[] = [];
  for (let i = 0; i < rows.length; i++) {
    const window = rows.slice(Math.max(0, i - 6), i + 1);
    const ma7 =
      window.length >= 7
        ? window.reduce((s, x) => s + (x.weightKg ?? 0), 0) / window.length
        : null;
    out.push({ date: rows[i].date, weightKg: rows[i].weightKg!, ma7 });
  }
  return out;
}

/** Trend pill text source — "−1.2 kg over 30d" / "+0.4 kg". Uses the last MA
 *  value vs the MA value ~windowDays ago. If we lack enough samples, returns
 *  null and the UI suppresses the pill. Identical logic to LimeLog so both
 *  apps agree on the trend. */
export function weightTrendOverDays(
  series: WeightPoint[],
  windowDays: number,
  now: Date = new Date(),
): { deltaKg: number; days: number } | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const since = new Date(now);
  since.setDate(since.getDate() - windowDays);
  const sinceKey = since.toISOString().slice(0, 10);
  const candidates = series.filter((p) => p.date >= sinceKey);
  if (candidates.length < 2) return null;
  const oldest = candidates[0];
  const baseline = oldest.ma7 ?? oldest.weightKg;
  const tip = latest.ma7 ?? latest.weightKg;
  const deltaKg = tip - baseline;
  const days = Math.max(
    1,
    Math.round(
      (new Date(latest.date).getTime() - new Date(oldest.date).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  return { deltaKg, days };
}

/** The most-recently-dated metric that has at least one measurement set
 *  (chest/waist/hips/arms/legs). Drives the "latest measurements" row. Returns
 *  null when the user only ever logged bodyweight. */
export function latestMeasurements(metrics: BodyMetric[]): BodyMetric | null {
  const withMeasure = metrics
    .filter(
      (m) =>
        m.chestCm != null ||
        m.waistCm != null ||
        m.hipsCm != null ||
        m.armsCm != null ||
        m.legsCm != null,
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return withMeasure[0] ?? null;
}
