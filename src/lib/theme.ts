// Theme selection — "instrument" (the free v1.10 default) plus "rack".
//
// The free theme is defined on bare `:root` and is never edited. Rack is an
// additive `[data-theme="rack"]` scope over the same custom-property names,
// so removing the attribute returns the app to v1.10 exactly. That is the
// regression gate the handoff asks for, and it is why `applyTheme('instrument')`
// removes the attribute rather than setting a third value.
//
// Applying is split in two: the pre-paint pass (public/theme-boot.js) sets the attribute
// from storage before the stylesheet paints (so a Rack user never sees a frame
// of the instrument theme), and this module owns every change after that.

import { useSyncExternalStore } from 'react';
import { isEntitled } from './entitlement';

export const FREE_THEME = 'instrument' as const;
export const PAID_THEMES = ['rack'] as const;
export type ThemeId = typeof FREE_THEME | (typeof PAID_THEMES)[number];
export const THEMES: ThemeId[] = [FREE_THEME, ...PAID_THEMES];

/** Shared with the pre-paint pass in public/theme-boot.js — two readers of one value. */
export const THEME_KEY = 'nexus.theme';

export function isPaidTheme(theme: ThemeId): boolean {
  return (PAID_THEMES as readonly string[]).includes(theme);
}

/**
 * What the user last chose, regardless of whether they may currently use it.
 * Kept separate from `activeTheme()` so a lapsed supporter who renews gets
 * their theme back rather than having silently been reset.
 */
export function preferredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY) as ThemeId | null;
    return v && THEMES.includes(v) ? v : FREE_THEME;
  } catch {
    return FREE_THEME;
  }
}

/** What should actually render. A paid theme with no entitlement falls back
 *  to the free one silently — never to a half-applied theme. */
export function activeTheme(): ThemeId {
  const pref = preferredTheme();
  return isPaidTheme(pref) && !isEntitled() ? FREE_THEME : pref;
}

/** v1.15 — fired on window after every apply. */
export const THEME_EVENT = 'nexus-theme-change';

export function applyTheme(theme: ThemeId = activeTheme()): ThemeId {
  const el = document.documentElement;
  if (theme === FREE_THEME || !THEMES.includes(theme)) delete el.dataset.theme;
  else el.dataset.theme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
  return theme;
}

function renderedTheme(): ThemeId {
  const v = document.documentElement.dataset.theme as ThemeId | undefined;
  return v && THEMES.includes(v) ? v : FREE_THEME;
}

function subscribeTheme(cb: () => void): () => void {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

/** The theme actually on screen, for the few components that render
 *  differently under Rack (the routing strip, the meter). */
export function useActiveTheme(): ThemeId {
  return useSyncExternalStore(subscribeTheme, renderedTheme, () => FREE_THEME);
}

export function setPreferredTheme(theme: ThemeId): ThemeId {
  const next: ThemeId = THEMES.includes(theme) ? theme : FREE_THEME;
  try {
    if (next === FREE_THEME) localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    /* storage unavailable — the choice just won't survive a relaunch */
  }
  return applyTheme(activeTheme());
}

/** Re-resolve after anything that can change entitlement. Idempotent. */
export function syncTheme(): ThemeId {
  return applyTheme(activeTheme());
}
