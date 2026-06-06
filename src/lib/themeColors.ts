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

/** Cyan accent. Same as tailwind colors.primary + --primary in index.css. */
export const PRIMARY = '#00D4FF';

/** Success green. Same as tailwind colors.success + --success in index.css. */
export const SUCCESS = '#3FB950';

/** Danger red. Same as tailwind colors.danger + --danger in index.css. */
export const DANGER = '#F85149';

/** Warning amber. Same as tailwind colors.warning + --warning in index.css. */
export const WARNING = '#D29922';

/** Soft violet — accent for "study" quadrant on the life-score ring and the
 *  fourth swatch in the habit color picker. Not in tailwind colors today;
 *  if it gets reused beyond these two surfaces, promote to a real token. */
export const VIOLET = '#A78BFA';

/** Muted slate-grey used as a track / disabled tint. Derived from
 *  text-muted ≈ #A8B2BC; alpha varies by surface (track vs rest-day track
 *  vs disabled). The constants below pre-bake the alpha so SVG strokes can
 *  consume them directly. */
export const MUTED_RGB = '168, 178, 188'; // text-muted as raw RGB
export const TRACK_DEFAULT = `rgba(${MUTED_RGB}, 0.22)`;
export const TRACK_REST = `rgba(${MUTED_RGB}, 0.16)`;
