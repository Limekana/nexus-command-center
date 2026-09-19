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
        // v1.10.1 — a HEIGHT gate, stacked onto `desktop:` where a style makes
        // something taller. `desktop:` alone assumes a wide screen is also a
        // tall one, which a 1366x768 laptop is not: the lock screen's desktop
        // sizing measured 1085px inside a 768px viewport and the user had to
        // scroll to reach the bottom row of the keypad. Set at 1000px so the
        // full-size treatment only appears where it actually fits.
        tall: { raw: '(min-height: 1000px)' },
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
        //
        // v1.15 (Item 13) — every value is read through a CSS variable whose
        // :root default is the exact v1.10 hex (src/index.css), so the free
        // theme renders unchanged and [data-theme='rack'] can re-point the
        // same names (src/themes/rack.css). `<alpha-value>` keeps opacity
        // utilities like `bg-primary/10` working.
        bg: 'rgb(var(--c-bg) / <alpha-value>)',              // page ground — near-black, faint cool bias
        surface: 'rgb(var(--c-surface) / <alpha-value>)',    // panel fill — flat, never translucent
        surface2: 'rgb(var(--c-surface2) / <alpha-value>)',  // nested / hovered panel
        border: 'rgb(var(--c-border) / <alpha-value>)',      // hairline rule and grid line
        'border-soft': 'rgb(var(--c-border-soft) / <alpha-value>)', // internal row divider (lighter than a rule)
        primary: {
          // The instrument colour. Marks the LIVE reading, the current value,
          // the emphasised endpoint of a series — nothing else. If more than
          // roughly two amber elements are on one screen, one of them is wrong.
          DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
          dim: 'rgb(var(--c-primary-dim) / <alpha-value>)',
        },
        text: {
          // Warm-tinted ink against cool-tinted neutrals. That asymmetry is
          // what makes the palette read as chosen rather than inherited —
          // do not "clean it up" to pure greys / pure white.
          DEFAULT: 'rgb(var(--c-text) / <alpha-value>)',
          muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
          faint: 'rgb(var(--c-text-faint) / <alpha-value>)',   // micro-labels, units, axis
        },
        // Semantic pair, deliberately desaturated so they never fight the
        // signal amber when a screen shows both.
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        // Advisory amber: same family as the signal, visibly dimmer. Kept
        // distinct so a caution state cannot be mistaken for a live reading.
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
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
