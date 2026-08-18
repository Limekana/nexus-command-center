/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // v1.9 Item 14 — shell tiers as named screens so content density and the
      // navigation shell key off the SAME numbers. `src/lib/useShell.ts`
      // resolves the identical boundaries in JS for the cases where a media
      // query is not enough (choosing what to mount, not just how to style it).
      // Additive: sm/md/lg/xl/2xl are untouched, so existing responsive
      // classes keep their current meaning.
      screens: {
        tablet: '769px',
        desktop: '1201px',
        wide: '1600px',
      },
      colors: {
        // ─── v1.10 "Precision instrument" palette ──────────────────────────
        // Seven values, and that is the whole palette. The design identity is
        // STRUCTURAL — hairline rules, a strict grid, tabular figures — not
        // chromatic. Colour is reserved for meaning, so adding an eighth
        // value here is almost always the wrong fix for a layout problem.
        //
        // The semantic names are unchanged from the Cyber Slate era on
        // purpose: ~300 call sites already say `text-text-muted` /
        // `border-border` / `bg-surface`, and re-pointing the names re-skins
        // all of them at once instead of touching every file.
        bg: '#0B0C0E',        // page ground — near-black, faint cool bias
        surface: '#141618',   // panel fill — flat, never translucent
        surface2: '#191C1F',  // nested / hovered panel
        border: '#23262A',    // hairline rule and grid line
        'border-soft': '#1A1D20', // internal row divider (lighter than a rule)
        primary: {
          // The instrument colour. Marks the LIVE reading, the current value,
          // the emphasised endpoint of a series — nothing else. If more than
          // roughly two amber elements are on one screen, one of them is wrong.
          DEFAULT: '#E8A33D',
          dim: '#A8752A',
        },
        text: {
          // Warm-tinted ink against cool-tinted neutrals. That asymmetry is
          // what makes the palette read as chosen rather than inherited —
          // do not "clean it up" to pure greys / pure white.
          DEFAULT: '#E8E6E1',
          muted: '#A9AEB4',
          faint: '#7C828A',   // micro-labels, units, axis
        },
        // Semantic pair, deliberately desaturated so they never fight the
        // signal amber when a screen shows both.
        danger: '#C4544B',
        success: '#4E9A6B',
        // Advisory amber: same family as the signal, visibly dimmer. Kept
        // distinct so a caution state cannot be mistaken for a live reading.
        warning: '#B98A3C',
      },
      fontFamily: {
        // IBM Plex — engineering lineage, true tabular figures, SIL OFL so it
        // self-hosts cleanly (F-Droid builds forbid the Google CDN call).
        // Replaces Space Grotesk + Inter, which were part of why the app read
        // as generated. Mono carries every numeric and every micro-label.
        heading: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // Near-square. An instrument face has edges, not pebbles. `pill`
        // collapses too — the pill shape had stopped distinguishing anything,
        // so it had stopped meaning anything. Tailwind's own `rounded-full`
        // is untouched, which keeps genuinely circular things (rings, dots,
        // avatars) circular: that distinction now carries information.
        sm: '2px',
        md: '2px',
        lg: '3px',
        xl: '3px',
        pill: '2px',
      },
      boxShadow: {
        // No drop shadows anywhere. Depth comes from rules and fills.
        // `glow` and the `glass*` stack are gone; `shadow-none` is the answer
        // for anything that used to reach for them. `signal` is the one
        // survivor: a 1px amber ring for the active/live element, which is a
        // border-weight statement rather than a bloom.
        signal: '0 0 0 1px #E8A33D',
      },
      transitionTimingFunction: {
        // Overshoot spring — for press feedback and toggles.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        // Smooth exponential — for page fades, list staggers, sheet slide.
        'spring-soft': 'cubic-bezier(0.16, 1, 0.3, 1)',
        // Quick decel — for taps and state flips that need to land fast.
        decel: 'cubic-bezier(0, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%':   { opacity: '0', transform: 'scale(0.94)' },
          '60%':  { opacity: '1', transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        'sheet-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'sheet-down': {
          '0%':   { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'pop-in':     'pop-in 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'sheet-up':   'sheet-up 340ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-down': 'sheet-down 240ms cubic-bezier(0.4, 0, 1, 1) both',
      },
    },
  },
  plugins: [],
};
