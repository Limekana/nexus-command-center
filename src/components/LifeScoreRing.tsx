// ─── v1.2 LifeScoreRing ─────────────────────────────────────────────────
//
// Big composite ring for the /life screen and history chips. Four arcs
// stacked at 90deg apart, one per sub-component (workouts, study, habits,
// budget). Each arc fills its quadrant proportionally to that sub-score.
//
// Center slot shows the composite score number — typeset large because
// it's the page's hero metric.
//
// Visual contract:
//   - Workouts (top)    = primary cyan
//   - Study (right)     = soft violet
//   - Habits (bottom)   = success green
//   - Budget (left)     = warning amber
//   These colors are intentionally distinct so the breakdown reads at a
//   glance — you can tell which quadrant is dragging the composite.

import { ReactNode } from 'react';
import { PRIMARY, SUCCESS, WARNING, VIOLET, TRACK_DEFAULT } from '../lib/themeColors';

export interface LifeScoreRingProps {
  workouts: number;       // 0..100
  study: number;          // 0..100
  habits: number;         // 0..100
  budget: number;         // 0..100
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;   // center slot — typically the composite score
}

export default function LifeScoreRing({
  workouts,
  study,
  habits,
  budget,
  size = 200,
  strokeWidth,
  children,
}: LifeScoreRingProps) {
  const sw = strokeWidth ?? Math.max(6, Math.round(size * 0.05));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const quadrant = circ / 4;

  // Each quadrant draws ¼ of the full circle. The arc within that quadrant
  // is scaled by the sub-score. We use stroke-dasharray with two values:
  // [arcLen, gap], then offset the start by quadrant index.
  function arc(score: number, idx: number, color: string) {
    const clamped = Math.max(0, Math.min(100, score));
    const arcLen = (quadrant * clamped) / 100;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${arcLen} ${circ - arcLen}`}
        // Offset by quadrant index * quadrant length. Negative offset moves
        // the dash start clockwise.
        strokeDashoffset={-idx * quadrant}
        style={{
          transition: 'stroke-dasharray 360ms cubic-bezier(0.16, 1, 0.3, 1)',
          filter: `drop-shadow(0 0 3px ${color}55)`,
        }}
      />
    );
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
        {/* Full-circle track behind everything */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={TRACK_DEFAULT}
          strokeWidth={sw}
        />
        {/* Four quadrant arcs — order matters for stacking (later ones
            paint on top), but since each writes only its quadrant slice
            they don't overlap. */}
        {arc(workouts, 0, PRIMARY)}
        {arc(study, 1, VIOLET)}
        {arc(habits, 2, SUCCESS)}
        {arc(budget, 3, WARNING)}
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {children}
        </div>
      )}
    </div>
  );
}
