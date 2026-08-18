// ─── Shared theme color constants ───────────────────────────────────────
//
// Single source of truth for the design-system colors that need to be
// referenced from JavaScript (SVG stroke values, inline style props, canvas
// fills) where Tailwind utility classes can't reach.
//
// MUST stay in sync with `tailwind.config.js` colors and `src/index.css`.
// When changing a token value, change it in BOTH places — this file isn't
// loaded by Tailwind, so a one-sided edit will drift the JS surface from
// the className surface and create theme inconsistency.
//
// Test device target: Galaxy S24 / dark default theme.

// ─── v1.10 instrument palette ───────────────────────────────────────────
// The seven values, mirrored from tailwind.config.js. Charts draw on the
// same ground the panels use, so they need the neutrals too — a chart that
// invents its own grey is the fastest way for a screen to stop matching the
// rest of the app.

/** Page ground. Same as tailwind colors.bg + --ground in index.css. */
export const GROUND = '#0B0C0E';
/** Panel fill. Same as tailwind colors.surface + --panel. */
export const PANEL = '#141618';
/** Hairline rule / grid line. Same as tailwind colors.border + --rule. */
export const RULE = '#23262A';
/** Internal row divider, one step below a rule. --rule-soft. */
export const RULE_SOFT = '#1A1D20';
/** Primary text. tailwind colors.text.DEFAULT + --ink. */
export const INK = '#E8E6E1';
/** Secondary text. tailwind colors.text.muted + --ink-dim. */
export const INK_DIM = '#A9AEB4';
/** Micro-labels, units, axis. tailwind colors.text.faint + --ink-mute. */
export const INK_MUTE = '#7C828A';

/** The signal amber — the LIVE reading, the current value, the emphasised
 *  endpoint of a series, and nothing else. Same as tailwind colors.primary
 *  + --signal. Kept under the name PRIMARY because ~40 call sites import it
 *  that way; the meaning is the one described here, not "brand colour". */
export const PRIMARY = '#E8A33D';

/** Semantic positive. tailwind colors.success + --pos. Desaturated on
 *  purpose so it never fights the signal when both are on screen. */
export const SUCCESS = '#4E9A6B';

/** Semantic negative. tailwind colors.danger + --neg. */
export const DANGER = '#C4544B';

/** Advisory amber — the same family as the signal, visibly dimmer, so a
 *  caution state cannot be mistaken for a live reading. tailwind
 *  colors.warning. */
export const WARNING = '#B98A3C';

// ─── Categorical ramps ──────────────────────────────────────────────────
//
// Two ramps, and they are NOT interchangeable with the semantic constants
// above. Before v1.10 the domain colours *were* the semantic ones, which
// meant the Life ring painted "budget" in the same amber that elsewhere
// means "warning" — and, on DomainTrendGrid, painted two different domains
// the identical colour. Category identity is real information and deserves
// its own scale.
//
// Both ramps hold their chroma and value roughly constant and vary only in
// hue, which is what stops a five-segment ring reading as a rainbow.

/** Per-domain identity. One entry per Life domain; stable across the ring,
 *  the trend grid and the Life screen so a colour means the same domain
 *  everywhere. */
export const DOMAIN = {
  /** The aggregate score — neutral on purpose; it is the sum, not a peer. */
  life: INK,
  fitness: '#4E9A6B',
  finance: '#E8A33D',
  study: '#5B87A8',
  habits: '#8E7BA8',
  work: '#B9707E',
} as const;

/** Ordered ramp for charts that colour N arbitrary series (donut slices,
 *  cash-flow bands, the habit colour picker). Ordered most-distinct-first,
 *  because index 0–2 carry the largest categories on every screen that uses
 *  it. The last entry is grey and is reserved for "Other" / unnamed. */
export const CATEGORICAL = [
  '#E8A33D', // amber
  '#5B87A8', // steel
  '#4E9A6B', // green
  '#B9707E', // rose
  '#8E7BA8', // violet
  '#6FA0A0', // teal
  '#7C828A', // grey — reserved for "Other"
] as const;

/** Soft violet — retained as a named export for the two surfaces that still
 *  import it directly. Prefer DOMAIN / CATEGORICAL for anything new. */
export const VIOLET = DOMAIN.habits;

/** Work domain accent — see DOMAIN.work. Retained for the same reason. */
export const WORK_PINK = DOMAIN.work;

/** Muted track / disabled tint, derived from --ink-dim. Alpha varies by
 *  surface (track vs rest-day track vs disabled). The constants below
 *  pre-bake the alpha so SVG strokes can consume them directly. */
const MUTED_RGB = '169, 174, 180'; // --ink-dim as raw RGB
export const TRACK_DEFAULT = `rgba(${MUTED_RGB}, 0.22)`;
export const TRACK_REST = `rgba(${MUTED_RGB}, 0.16)`;
