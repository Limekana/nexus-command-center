# Handoff: Vault Unlock — 870ms Iris Animation

## Overview

This bundle delivers the **cold-start unlock animation** for Nexus Command Center: a 870ms camera-shutter "iris" that plays after the user enters their PIN / completes biometric on the first unlock of an app launch, then reveals the dashboard underneath. The animation reinforces the "secure vault" brand promise (AES-256 / TLS 1.3) and gives the app a memorable cold-start moment without slowing routine re-entries.

**Behavior summary**

| Condition                                                | Result                          |
| -------------------------------------------------------- | ------------------------------- |
| First successful unlock after a fresh app launch         | 870 ms iris animation           |
| All subsequent unlocks in the same session               | Instant (no animation)          |
| `Settings → Security → Unlock Animation` toggle is off   | Instant always                  |
| OS-level `prefers-reduced-motion: reduce`                | Instant always                  |

## About the Design Files

The files in `reference/` are **design references created in HTML** — a working prototype showing the intended look, timing, and behavior. They are **not production code to copy directly**. Your task is to take the production-ready React component in `src/` (already extracted and TypeScript-ified) and integrate it into the existing Nexus codebase using your established patterns (component co-location, theming, state management, etc.).

If your codebase uses something other than plain React + CSS Modules — e.g. Tailwind, styled-components, NativeWind, vanilla-extract — adapt the styles to that idiom, preserving exact values for: durations, easings, colors, transforms, and the keyframe percentages. Those numbers are the design.

## Fidelity

**High-fidelity (hifi).** All timings, colors, easings, and keyframe values are final and have been tuned against the design target. Recreate pixel-perfectly; do not "round" durations or simplify the keyframes.

## Files

```
design_handoff_vault_unlock/
├── README.md                       — this file
├── src/
│   ├── VaultUnlock.tsx             — the React component to drop in
│   ├── VaultUnlock.css             — companion stylesheet (keyframes + tokens)
│   └── useVaultUnlock.ts           — hook for cold-start gating + reduced-motion
└── reference/
    ├── Vault Unlock.html           — the working prototype (open in a browser)
    ├── vault-unlock.jsx            — original blade/SVG implementation
    ├── screens.jsx                 — reference lock/dashboard screens (not for prod use)
    └── app.jsx                     — reference orchestration (not for prod use)
```

## Quick start

1. Copy `src/VaultUnlock.tsx`, `src/VaultUnlock.css`, and `src/useVaultUnlock.ts` into your codebase (e.g. `src/components/VaultUnlock/`).
2. In your unlock screen, wire it up:

```tsx
import VaultUnlock from '~/components/VaultUnlock/VaultUnlock';
import { useVaultUnlock } from '~/components/VaultUnlock/useVaultUnlock';

function UnlockScreen() {
  const [playingIris, setPlayingIris] = useState(false);
  const { shouldPlayIris, consume } = useVaultUnlock({
    enabledInSettings: useSettings(s => s.security.unlockAnimation),
  });

  async function handleAuth() {
    const ok = await authenticate();          // your bio/PIN flow
    if (!ok) return;

    if (shouldPlayIris) {
      consume();                              // mark cold-start as spent
      setPlayingIris(true);                   // mount the iris
    } else {
      router.replace('/dashboard');           // instant
    }
  }

  return (
    <>
      {/* … your PIN keypad / bio prompt … */}

      <VaultUnlock
        playing={playingIris}
        onComplete={() => {
          setPlayingIris(false);
          router.replace('/dashboard');
        }}
      />
    </>
  );
}
```

3. Pre-mount the dashboard underneath the iris and fade it in. The iris uses `position: fixed; pointer-events: none` so it overlays whatever is below — the dashboard can already be painted under it. Apply a `220ms` delayed fade-in to the dashboard root so it appears just as the blades start retracting:

```css
.dashboard-root {
  opacity: 0;
  transition: opacity 500ms ease-out 220ms;
}
.dashboard-root[data-revealed='true'] {
  opacity: 1;
}
```

## Native (Capacitor) note

`useVaultUnlock.ts` defaults to a **module-level flag** for cold-start detection (`COLD_START_STRATEGY = 'memory'`). This is correct on native: an Android `Activity` recreate (rotation, configuration change) preserves `sessionStorage`, which would cause the iris to be wrongly skipped after a rotate. The module flag dies on a true process restart, which is when you actually want the iris to play.

If you ship a pure-web build (PWA), switch the constant at the top of the file to `'session'` to survive accidental page refreshes.

## Component API

```ts
type VaultUnlockProps = {
  playing: boolean;                  // mount + start animation when true
  onComplete: () => void;            // fires after `duration` ms
  bladeCount?: number;               // default 8 — drop to 6 if seams show
  duration?: number;                 // default 870 ms
  revealDelay?: number;              // default 220 ms — informs the host
  scanlineColor?: string;            // default 'rgba(21, 101, 192, 0.95)'
  scanlineGlow?: number;             // default 12 px
  coreColor?: string;                // default '#22D3EE' — app accent cyan
};
```

## Anatomy

The overlay is **4 paint layers**, all transform/opacity, all GPU-composited:

1. **Vignette** — radial-gradient `#0A1018 → #05080D → #000` behind the blades. Fades out from 70% → 100% of duration. Its job is to hide any thin seams as the blades retract.
2. **Iris blades** — 8 triangular `<path>`s in a single inline SVG (viewBox `-50 -50 100 100`). Each has its apex at SVG origin (= viewport center) and its base 140 units out. Adjacent blades overlap by 1° so no dashboard pixel leaks through at t=0.
3. **Core** — 12 px cyan dot at viewport center, animates `scale(0)` → `scale(11)` with opacity dropping off after the 18% peak.
4. **Scanline** — 2px horizontal bar with `box-shadow` glow, `mix-blend-mode: screen`, sweeps `translateY(-20px → 110vh)` over the full duration.

### Why SVG instead of div + clip-path

The first prototype used 8 divs with `clip-path: polygon(...)` to form wedges. They worked mechanically, but were invisible against the dark dashboard because the fill was a flat dark color. Switching to SVG buys:

- **Strokes** along the radial edges — these are what make the closed iris read as a cyan asterisk
- **A single radial gradient** defined once in `<defs>` and referenced via `fill="url(#…)"` — cheap on memory and pre-computed by the browser
- **A single `drop-shadow`** filter on the parent SVG instead of per-blade filters (which would compound the paint cost on lower-end devices)

## Blade geometry

```
   viewBox: -50 -50 100 100        SVG user space, square, centered at (0,0)
                                   The visible region (post-slice) covers
                                   100 units of stage height, more of the width.

   Blade apex     ◯ (0, 0)         = viewport center
                 / \
                /   \
               /     \              Two-sided radial edges, stroked cyan
              /       \
             /  blade  \
            /           \
   Outer base ── ────── ── y = -140
                                    Well past any phone screen edge.

   Half-angle:  π/N + 1°            +1° overlap kills seams at t=0
   ax = sin(half) · R               Right vertex
   ay = -cos(half) · R              (y is negative = up in SVG)
   bx = -sin(half) · R              Left vertex
   by = -cos(half) · R
```

Each blade is rotated by `i × (360°/N)` to fill its sector.

## Keyframe table (the design)

Total duration = 870 ms (the design target). All keyframes use
`cubic-bezier(.55, .05, .25, 1)` unless noted.

### Blade (`vu-blade-open`)

| Stop | Transform                                                            | Opacity |
| ---- | -------------------------------------------------------------------- | ------- |
| 0%   | `rotate(base)             translateY(0)     scale(1)`                | 1       |
| 18%  | `rotate(base)             translateY(0)     scale(1)`                | 1       |
| 36%  | `rotate(base + 6°)        translateY(-4px)  scale(1)`                | 1       |
| 62%  | `rotate(base + 16°)       translateY(-26px) scale(1.04)`             | 1       |
| 82%  | `rotate(base + 24°)       translateY(-60px) scale(1.08)`             | 0.7     |
| 100% | `rotate(base + 30°)       translateY(-120px) scale(1.12)`            | 0       |

The `0% → 18%` hold is intentional — it lets the user **read** the closed iris before it starts to open. Without that beat the animation reads as a quick flash and the secure-vault metaphor doesn't land.

Per-blade `animation-delay: i × 8ms` adds a faint cascade so the blades don't all retract on the same frame.

### Vignette (`vu-vignette-out`)

| Stop | Opacity |
| ---- | ------- |
| 0%   | 1       |
| 70%  | 1       |
| 100% | 0       |

Easing: `cubic-bezier(.5, 0, .2, 1)`.

### Core (`vu-core-flash`)

| Stop | Transform                                | Opacity |
| ---- | ---------------------------------------- | ------- |
| 0%   | `translate(-50%,-50%) scale(0)`          | 0       |
| 18%  | `translate(-50%,-50%) scale(1.4)`        | 1       |
| 45%  | `translate(-50%,-50%) scale(3.5)`        | 0.55    |
| 75%  | `translate(-50%,-50%) scale(7)`          | 0.2     |
| 100% | `translate(-50%,-50%) scale(11)`         | 0       |

Easing: `cubic-bezier(.2, .8, .3, 1)`.

### Scanline (`vu-scan-sweep`)

| Stop | Transform               | Opacity |
| ---- | ----------------------- | ------- |
| 0%   | `translateY(-20px)`     | 0       |
| 10%  | (same)                  | 1       |
| 50%  | (same)                  | 1       |
| 90%  | `translateY(100vh)`     | 0.8     |
| 100% | `translateY(110vh)`     | 0       |

Easing: `cubic-bezier(.45, .1, .25, 1)`.

## Design Tokens

### Colors

| Token                | Value                          | Used for                                  |
| -------------------- | ------------------------------ | ----------------------------------------- |
| `--vu-core-color`    | `#22D3EE`                      | Core dot, blade strokes, glow             |
| Mid-stop accent      | `#1565C0`                      | Secondary blue inside the radial gradient |
| Blade body 1         | `#1E2B47`                      | Inner blade panel (light end)             |
| Blade body 2         | `#152238`                      | Mid blade panel                           |
| Blade body 3         | `#0C162A`                      | Outer blade panel                         |
| Blade body 4         | `#050A14`                      | Furthest blade panel (background blend)   |
| `--vu-scanline-color`| `rgba(21, 101, 192, 0.95)`     | Scanline bar + its glow                   |
| Vignette stops       | `#0A1018` → `#05080D` → `#000` | Background fade beneath blades            |

Stroke on blade edges: `rgba(34, 211, 238, 0.75)` at width `0.7` (SVG user units).

### Timing

| Token                  | Value          | Notes                                     |
| ---------------------- | -------------- | ----------------------------------------- |
| `--vu-duration`        | `870 ms`       | Total animation budget                    |
| `--vu-reveal-delay`    | `220 ms`       | Dashboard fade-in start, after iris mount |
| `--vu-blade-delay` (i) | `i × 8 ms`     | Per-blade stagger                         |
| Dashboard fade         | `500 ms`       | After the 220ms delay                     |

### Other

| Token                  | Value | Notes                                     |
| ---------------------- | ----- | ----------------------------------------- |
| `--vu-scanline-glow`   | `12px`| Box-shadow blur (lower if it looks too "tron") |
| Blade stroke width     | `0.7` | In SVG user units → ~6 px on a 412-wide phone |
| Blade count            | `8`   | Drop to `6` on very small screens         |

## Interactions & Behavior

- **No user input is intercepted** during the animation. The overlay has `pointer-events: none`. The dashboard underneath can receive taps in the last ~200 ms of the animation, which is desirable (keeps the app responsive).
- **No `animationend` listener.** Completion is driven by `setTimeout(onComplete, duration)` to guarantee exactly one fire per play. This is robust against the iris being unmounted mid-flight (e.g. the user backgrounds the app — Android Capacitor freezes the WebView, the timer pauses, and resumes on return; if you'd rather snap to the end on backgrounding, listen for `visibilitychange` and call `onComplete` early).
- **Sound:** none. The PRD doesn't call for it; if added later, fire it on the same trigger that sets `playing: true`.

## State Management

- **Cold-start flag.** Stored in a module-level `let` (`COLD_START_CONSUMED`) by default. See `useVaultUnlock.ts` for the `COLD_START_STRATEGY` swap point (memory vs sessionStorage).
- **Settings toggle.** Read from wherever your app stores `settings.security.unlockAnimation`. Pass it into `useVaultUnlock` as `enabledInSettings`.
- **Reduced motion.** Detected via `window.matchMedia('(prefers-reduced-motion: reduce)')`, listened to live so a change during the session takes effect on next unlock.

## Performance

- 4 paint layers (vignette + SVG + core + scanline). `bladeCount = 8` adds 8 SVG `<g>` elements inside the SVG, but they're all transforms on the same SVG paint layer — the browser composites once.
- All `will-change: transform, opacity` are set on animated elements.
- `contain: layout paint` on the root overlay scopes layout invalidation.
- No filters except a single `drop-shadow` on the SVG root.
- Tested target: Galaxy A series. If you observe drops:
  1. First, drop `bladeCount` from 8 → 6.
  2. Then, remove the SVG `drop-shadow` (it's the most expensive single property).
  3. As a last resort, lower scanline `--vu-scanline-glow` from 12 → 8.

## Assets

None. The iris is entirely declarative CSS + inline SVG. No image, font, or icon assets are required.

## Testing checklist

- [ ] Fresh launch → unlock with bio: iris plays for ~870ms, dashboard reveals through center
- [ ] Lock & unlock again same session: instant (no animation)
- [ ] Settings → Unlock Animation OFF → unlock: instant
- [ ] OS toggle "Remove animations" / "Reduce motion" ON → unlock: instant
- [ ] Force kill app, relaunch, unlock: iris plays again (cold-start)
- [ ] Rotate device mid-animation: no jank, no orphaned blades
- [ ] Background app at t=400ms, foreground at t=2000ms: see "no `animationend` listener" note above and pick the behavior you want
- [ ] Wrong PIN, then correct PIN: iris plays exactly once (not on the wrong-PIN attempt)
- [ ] PIN entry → correct → iris → dashboard: no double-fade, no flash of unstyled content
