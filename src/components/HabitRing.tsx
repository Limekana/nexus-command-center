// ─── v1.2 HabitRing ────────────────────────────────────────────────────────
//
// Reusable progress ring for habits. Single SVG with two stacked circles:
// a track ring (always visible, dimmed) and a progress arc (stroke-dashed).
// Center slot accepts children — typically a streak number or amount label.
//
// Visual contract:
//   - state='rest'    : ghost outline, dashed, no fill arc.  Use for habits
//                       that aren't eligible today (specific-days off-day).
//   - state='idle'    : solid track, no progress visible (used when progress=0
//                       on an eligible day — the user hasn't logged yet).
//   - state='partial' : cyan/color arc partially filling the ring. Use for
//                       quantified habits that have progress but haven't hit
//                       target.
//   - state='done'    : success-green ring with glow halo. Use when the
//                       habit hit target for the day.
//
// Motion:
//   - stroke-dashoffset transitions via ease-spring-soft over 360ms, so
//     completing a habit feels like the ring "lands" rather than snapping.
//
// Sizing:
//   - default 72px, but the dashboard strip uses ~52px and the Today cards
//     use ~96px. strokeWidth scales naturally — pass an explicit override
//     when the ring needs to be especially chunky/thin.

import { ReactNode } from 'react';
import { PRIMARY, SUCCESS, TRACK_DEFAULT, TRACK_REST } from '../lib/themeColors';

export type HabitRingState = 'rest' | 'idle' | 'partial' | 'done';

interface HabitRingProps {
  /** 0..1, clamped internally. */
  progress: number;
  state: HabitRingState;
  size?: number;
  strokeWidth?: number;
  /** Optional color override for the partial arc. Defaults to primary cyan.
   *  state='done' always uses success-green regardless. */
  color?: string;
  /** Center slot — typically a streak count or amount label. */
  children?: ReactNode;
  /** Optional aria label. Falls back to a generic progress description. */
  ariaLabel?: string;
}

// v1.2 UI/UX review #7+#8 — color constants are imported from the shared
// theme module so the SVG stroke values stay in sync with the tailwind
// + CSS-token surface. The previous inline duplicates would have drifted
// if either token changed.

export default function HabitRing({
  progress,
  state,
  size = 72,
  strokeWidth,
  color,
  children,
  ariaLabel,
}: HabitRingProps) {
  const sw = strokeWidth ?? Math.max(3, Math.round(size * 0.075));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;

  const clamped = Math.max(0, Math.min(1, progress));
  const showProgress = state === 'partial' || state === 'done';
  const arcLen = state === 'done' ? circ : circ * clamped;
  const offset = circ - arcLen;

  const arcColor = state === 'done' ? SUCCESS : color ?? PRIMARY;
  const trackColor = state === 'rest' ? TRACK_REST : TRACK_DEFAULT;
  const trackDash = state === 'rest' ? '4 4' : undefined;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {state === 'done' && (
        // Halo behind the ring. Pseudo-element via blurred radial — pure CSS.
        <div
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: `0 0 14px -2px ${SUCCESS}80, inset 0 0 8px -2px ${SUCCESS}50`,
            background: `radial-gradient(circle at center, ${SUCCESS}18 0%, transparent 65%)`,
          }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={
          ariaLabel ??
          (state === 'done'
            ? 'Habit completed'
            : state === 'rest'
              ? 'Rest day'
              : `Habit progress ${Math.round(clamped * 100)}%`)
        }
        // Rotate -90deg so the arc starts at 12 o'clock instead of 3 o'clock.
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={sw}
          strokeDasharray={trackDash}
        />
        {showProgress && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={arcColor}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{
              // ease-spring-soft from the design tokens. Applied inline so we
              // don't need a one-off Tailwind utility.
              transition: 'stroke-dashoffset 360ms cubic-bezier(0.16, 1, 0.3, 1)',
              // A subtle drop-shadow on the arc makes the cyan / green
              // pop against the glass-strong backdrop on the Today cards.
              filter: state === 'done'
                ? `drop-shadow(0 0 4px ${SUCCESS}66)`
                : `drop-shadow(0 0 3px ${arcColor}55)`,
            }}
          />
        )}
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {children}
        </div>
      )}
    </div>
  );
}
