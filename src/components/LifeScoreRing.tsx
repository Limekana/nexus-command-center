// ─── v1.2 LifeScoreRing (v1.5 profile-aware) ────────────────────────────
//
// Composite ring for the /life screen + history chips.
//
// Two modes:
//   - Legacy (workouts/study/habits/budget props): four fixed quadrant arcs,
//     90° apart, each filled proportionally to its sub-score. Used by the
//     history chips and any pre-v1.5 caller.
//   - Profile (segments prop): one arc PER enabled domain, sized to that
//     domain's weight share of the circle and filled proportionally to its
//     score. This is what the Life tab uses once a LifeProfile is active, so
//     the ring's geometry mirrors the profile's weighting.
//
// Center slot shows the composite score number — the page's hero metric.

import { ReactNode } from 'react';
import { PRIMARY, SUCCESS, WARNING, VIOLET, TRACK_DEFAULT } from '../lib/themeColors';

export interface RingSegment {
  key: string;
  /** 0..100 — how full this domain's arc is. */
  score: number;
  /** Relative weight; the arc spans weight / Σweights of the circle. */
  weight: number;
  color: string;
}

export interface LifeScoreRingProps {
  /** Legacy quadrant inputs (ignored when `segments` is provided). */
  workouts?: number;
  study?: number;
  habits?: number;
  budget?: number;
  /** v1.5 — weighted per-domain arcs. Takes precedence over the legacy props. */
  segments?: RingSegment[];
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}

export default function LifeScoreRing({
  workouts = 0,
  study = 0,
  habits = 0,
  budget = 0,
  segments,
  size = 200,
  strokeWidth,
  children,
}: LifeScoreRingProps) {
  const sw = strokeWidth ?? Math.max(6, Math.round(size * 0.05));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;

  // Build the list of arcs to draw. Each arc reserves `span` of the circle
  // (its slot) and fills `fill` of that slot. A 1px gap between slots keeps
  // adjacent domains visually separable.
  const GAP = segments && segments.length > 1 ? circ * 0.012 : 0;
  const arcs: { fill: number; offset: number; color: string; key: string }[] = [];

  if (segments && segments.length > 0) {
    const totalWeight = segments.reduce((s, seg) => s + Math.max(0, seg.weight), 0) || 1;
    let cursor = 0;
    for (const seg of segments) {
      const span = (circ * Math.max(0, seg.weight)) / totalWeight;
      const usable = Math.max(0, span - GAP);
      const clampedScore = Math.max(0, Math.min(100, seg.score));
      arcs.push({
        fill: (usable * clampedScore) / 100,
        offset: cursor,
        color: seg.color,
        key: seg.key,
      });
      cursor += span;
    }
  } else {
    const quadrant = circ / 4;
    const legacy: [number, string, string][] = [
      [workouts, PRIMARY, 'workouts'],
      [study, VIOLET, 'study'],
      [habits, SUCCESS, 'habits'],
      [budget, WARNING, 'budget'],
    ];
    legacy.forEach(([score, color, key], idx) => {
      const clamped = Math.max(0, Math.min(100, score));
      arcs.push({
        fill: (quadrant * clamped) / 100,
        offset: idx * quadrant,
        color,
        key,
      });
    });
  }

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        role="img"
        aria-label="Life score breakdown"
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={TRACK_DEFA