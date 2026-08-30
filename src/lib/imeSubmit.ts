// Keyboard handling that does not fight an input method editor.
//
// Ported from StudyDesk's `src/lib/imeSubmit.js`, which shipped in 1.11.1 to
// close GitHub issue #35. NCC has never had a CJK bug report, but it has the
// same defect and nobody has ever typed Chinese into it — which is exactly how
// StudyDesk's went unnoticed across every release since 1.5.
//
// The problem: an IME builds a character over several keystrokes, and it uses
// ordinary keys to do it. Enter commits the candidate. Arrow keys move through
// the candidate list. Some IMEs use Tab, and Escape cancels the composition.
// While that is happening those keys belong to the IME, not to the app — but in
// an Android WebView they still reach the React handler, so an app that acts on
// them steals them mid-word.
//
// Three signals, because no single one is reliable across WebView versions:
//
//   1. `nativeEvent.isComposing` — the standard, and correct where implemented.
//      React's SyntheticEvent does not surface it, hence nativeEvent.
//   2. `keyCode === 229` — what a WebView reports for a keystroke the IME has
//      swallowed. Predates isComposing and is still what several Android
//      keyboards actually send. A real Enter is 13, so this never false-fires.
//   3. A composition flag we keep ourselves. Some WebView builds have already
//      cleared isComposing by the time keydown is dispatched, which is the whole
//      bug reappearing through the one check that was supposed to catch it.
//      compositionstart/compositionend bracket the session unambiguously.
//
// The flag lives in a WeakSet keyed on the DOM element, not in a ref or a hook.
// That keeps `compositionTracking` a module-level constant with no closure, so
// spreading it onto an input passes nothing that could be read during render —
// which is what `react-hooks/refs` (an `error` here since HYG-4) objects to
// when you hand a component-scope handler to a wrapper function instead.

import type React from 'react';

const composing = new WeakSet<Element>();

/**
 * Composition-tracking props. Spread onto any input whose keydown handler calls
 * `isComposing`; the two must travel together, since the check depends on this
 * bracketing for the WebViews that clear `isComposing` too early.
 *
 * A frozen module-level object: identity is stable across renders, so it never
 * causes a re-render and never trips the ref-during-render rule.
 */
export const compositionTracking = Object.freeze({
  onCompositionStart: (e: React.CompositionEvent) => { composing.add(e.currentTarget); },
  onCompositionEnd: (e: React.CompositionEvent) => { composing.delete(e.currentTarget); },
});

/**
 * True while the IME owns this keystroke. Call it first in a keydown handler
 * and return early.
 *
 * Guard the *whole* handler, not just Enter, wherever the handler claims more
 * than one key. `QuickAddOverlay` is the case that motivated this: it binds
 * ArrowUp/ArrowDown to its suggestion highlight, Tab to accept, Enter to
 * accept-or-save and Escape to close, and every branch calls `preventDefault()`.
 * Guarding only Enter would still leave a Chinese user unable to pick a
 * candidate, because the arrow keys — which is how you walk the candidate list —
 * would move NCC's highlight instead.
 */
export function isComposing(e: React.KeyboardEvent): boolean {
  const ne = e.nativeEvent as KeyboardEvent | undefined;
  return Boolean(
    ne?.isComposing ||
    e.keyCode === 229 ||
    ne?.keyCode === 229 ||
    composing.has(e.currentTarget),
  );
}
