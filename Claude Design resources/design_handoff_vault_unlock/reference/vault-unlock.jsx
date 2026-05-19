/* ─────────────────────────────────────────────────────────────
   VaultUnlock — 870ms iris animation
   ───────────────────────────────────────────────────────────── */

const { useEffect, useRef, useState } = React;

// Tunables — exposed for Tweaks panel to override
const DEFAULTS = {
  BLADE_COUNT: 8,
  DURATION: 870,           // ms — total animation budget
  REVEAL_DELAY: 220,       // ms — dashboard fade-in start
  SCANLINE_COLOR: 'rgba(21, 101, 192, 0.95)',
  SCANLINE_GLOW: 12,       // px — box-shadow blur
  CORE_COLOR: '#22D3EE',   // matches app cyan accent
  IRIS_FILL: '#050B14',    // deep near-black with hint of blue
};

/* The Iris itself — rendered as SVG for clean, visibly-stroked blades.
   - N triangular blades meeting at the viewport center.
   - Each has a radial gradient fill (cyan tint near center → dark at outer base)
     and a thin cyan stroke along its radial edges, so you actually SEE the
     shutter geometry as it opens.
   - Each blade pivots around viewport center, rotating +28° while translating
     outward → aperture opens from middle out (real camera-iris motion).
*/
function IrisBlades({ count, duration, fill }) {
  // 100×100 viewBox centered at (0,0). Blades extend to radius=120 so they
  // safely cover the corners of any phone aspect ratio.
  const R = 140;
  // Half-angle of each wedge in radians; +1° overlap so adjacent edges
  // never let a dashboard pixel leak through at t=0.
  const half = ((Math.PI * 2) / count) / 2 + (1 * Math.PI / 180);
  const ax = Math.sin(half) * R;
  const ay = -Math.cos(half) * R;
  const bx = -Math.sin(half) * R;
  const by = -Math.cos(half) * R;

  const blades = [];
  for (let i = 0; i < count; i++) {
    const baseRotation = (360 / count) * i; // 0deg = pointing up
    blades.push(
      <g
        key={i}
        className="iris-blade"
        style={{
          '--base-rot': `${baseRotation}deg`,
          '--blade-delay': `${i * 8}ms`,
          animationDuration: `${duration}ms`,
        }}
      >
        <path
          d={`M 0 0 L ${ax} ${ay} L ${bx} ${by} Z`}
          fill={`url(#bladeGrad-${count})`}
          stroke="rgba(34, 211, 238, 0.75)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </g>,
    );
  }

  return (
    <svg
      className="iris-blades-svg"
      viewBox="-50 -50 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`bladeGrad-${count}`} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#22D3EE" stopOpacity="0.95" />
          <stop offset="2%"   stopColor="#1565C0" stopOpacity="0.85" />
          <stop offset="6%"   stopColor="#1E2B47" stopOpacity="1" />
          <stop offset="25%"  stopColor="#152238" stopOpacity="1" />
          <stop offset="60%"  stopColor="#0C162A" stopOpacity="1" />
          <stop offset="100%" stopColor="#050A14" stopOpacity="1" />
        </radialGradient>
      </defs>
      {blades}
    </svg>
  );
}

function VaultUnlock({ onComplete, blades, duration, scanlineColor, scanlineGlow, coreColor, irisFill }) {
  // Mount → animation runs once → onComplete fires.
  useEffect(() => {
    const t = setTimeout(() => onComplete?.(), duration);
    return () => clearTimeout(t);
  }, [duration, onComplete]);

  return (
    <div
      className="vault-unlock"
      style={{
        '--duration': `${duration}ms`,
        '--reveal-delay': `${DEFAULTS.REVEAL_DELAY}ms`,
        '--scanline-color': scanlineColor,
        '--scanline-glow': `${scanlineGlow}px`,
        '--core-color': coreColor,
      }}
    >
      {/* Soft radial vignette under the blades — hides any seams when they retract */}
      <div className="iris-vignette" />

      <IrisBlades count={blades} duration={duration} fill={irisFill} />

      {/* Glowing core — sits at viewport center, pulses out as the iris opens */}
      <div className="iris-core" />

      {/* Scanline — horizontal sweep top→bottom */}
      <div className="iris-scanline" />
    </div>
  );
}

window.VaultUnlock = VaultUnlock;
window.VAULT_DEFAULTS = DEFAULTS;
