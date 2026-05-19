/* VaultUnlock.tsx — 870ms iris animation for cold-start unlock.
 *
 * Drop-in React component. Renders nothing when not animating; renders a
 * full-screen iris overlay when `playing` is true; calls `onComplete` after
 * `duration` ms.
 *
 * Caller decides WHEN to play (cold-start gating, reduced-motion, settings
 * toggle) — see useVaultUnlock.ts in this folder for the recommended hook.
 */

import { useEffect } from 'react';
import './VaultUnlock.css';

export type VaultUnlockProps = {
  /** When true, mount the iris and run the animation. When false, render nothing. */
  playing: boolean;
  /** Fires after `duration` ms — typically transitions your view to the dashboard. */
  onComplete: () => void;
  /** Number of blades. 8 is the design target; drop to 6 if seams show on small screens. */
  bladeCount?: number;
  /** Total animation budget in ms. Design target = 870. */
  duration?: number;
  /** Dashboard fade-in delay (ms). Lower toward 0 if seams flash through the blades. */
  revealDelay?: number;
  /** Scanline color, e.g. 'rgba(21, 101, 192, 0.95)'. */
  scanlineColor?: string;
  /** Scanline glow blur radius in px. */
  scanlineGlow?: number;
  /** Color of the central core pulse. Should match your app's primary accent. */
  coreColor?: string;
};

const DEFAULTS = {
  bladeCount: 8,
  duration: 870,
  revealDelay: 220,
  scanlineColor: 'rgba(21, 101, 192, 0.95)',
  scanlineGlow: 12,
  coreColor: '#22D3EE',
};

export default function VaultUnlock({
  playing,
  onComplete,
  bladeCount = DEFAULTS.bladeCount,
  duration = DEFAULTS.duration,
  revealDelay = DEFAULTS.revealDelay,
  scanlineColor = DEFAULTS.scanlineColor,
  scanlineGlow = DEFAULTS.scanlineGlow,
  coreColor = DEFAULTS.coreColor,
}: VaultUnlockProps) {
  // Drive completion off setTimeout, not animationend, so we get exactly
  // one fire even if the user has multiple blade events queued.
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(onComplete, duration);
    return () => window.clearTimeout(t);
  }, [playing, duration, onComplete]);

  if (!playing) return null;

  return (
    <div
      className="vault-unlock"
      style={{
        ['--vu-duration' as any]: `${duration}ms`,
        ['--vu-reveal-delay' as any]: `${revealDelay}ms`,
        ['--vu-scanline-color' as any]: scanlineColor,
        ['--vu-scanline-glow' as any]: `${scanlineGlow}px`,
        ['--vu-core-color' as any]: coreColor,
      }}
      aria-hidden="true"
    >
      <div className="vu-vignette" />
      <IrisBlades count={bladeCount} duration={duration} />
      <div className="vu-core" />
      <div className="vu-scanline" />
    </div>
  );
}

/* ── Iris blades — inline SVG.
 *
 * Each blade is a triangular <path> whose apex sits at viewport center (0,0
 * in the SVG user space). 12 blades meeting at the origin form an opaque
 * cover; as each rotates +30° and translates outward radially, the inner
 * vertex pulls away from center first → aperture opens from the middle out.
 *
 * Why SVG, not div + clip-path:
 *   - Clean strokes (visible cyan edges = readable shutter geometry)
 *   - Single radial gradient defined once and reused via fill="url(#...)"
 *   - drop-shadow filter applied once on the parent SVG (cheap)
 */
function IrisBlades({ count, duration }: { count: number; duration: number }) {
  const R = 140; // radius in SVG units; blades extend well past any viewport
  // Half-angle of each wedge (rad). +1° overlap kills seams at t=0.
  const half = (Math.PI * 2) / count / 2 + (Math.PI / 180);
  const ax = Math.sin(half) * R;
  const ay = -Math.cos(half) * R;
  const bx = -Math.sin(half) * R;
  const by = -Math.cos(half) * R;
  const d = `M 0 0 L ${ax} ${ay} L ${bx} ${by} Z`;
  const gradId = `vu-blade-grad-${count}`;

  const blades = [];
  for (let i = 0; i < count; i++) {
    const baseRotation = (360 / count) * i; // 0° = up
    blades.push(
      <g
        key={i}
        className="vu-blade"
        style={
          {
            ['--vu-base-rot' as any]: `${baseRotation}deg`,
            ['--vu-blade-delay' as any]: `${i * 8}ms`,
            animationDuration: `${duration}ms`,
          } as React.CSSProperties
        }
      >
        <path
          d={d}
          fill={`url(#${gradId})`}
          stroke="rgba(34, 211, 238, 0.75)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </g>,
    );
  }

  return (
    <svg
      className="vu-blades-svg"
      viewBox="-50 -50 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gradId} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.95" />
          <stop offset="2%" stopColor="#1565C0" stopOpacity="0.85" />
          <stop offset="6%" stopColor="#1E2B47" stopOpacity="1" />
          <stop offset="25%" stopColor="#152238" stopOpacity="1" />
          <stop offset="60%" stopColor="#0C162A" stopOpacity="1" />
          <stop offset="100%" stopColor="#050A14" stopOpacity="1" />
        </radialGradient>
      </defs>
      {blades}
    </svg>
  );
}
