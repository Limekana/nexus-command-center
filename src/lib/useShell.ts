// v1.9 Item 14, Phase 1 — the desktop shell's tier model.
//
// NCC had no breakpoint at all: `AppShell` wrapped every screen in
// `max-w-md mx-auto` (448px) and pinned a fixed `BottomTabBar` to the bottom,
// so a 1920px window rendered a phone-width column with ~730px of dead space
// on each side and a floating pill nav sized for a thumb.
//
// Three tiers now:
//   phone    < 769px   untouched — bottom tab bar, max-w-md column
//   tablet   769–1200  sidebar rail replaces the tab bar, wider column
//   desktop  > 1200px  full sidebar, wider column still
//
// Deliberately a port of StudyDesk's `src/lib/useShell.js`, same breakpoints
// and same storage semantics, so the two apps' shells stay in step — the plan
// calls for one navigation pattern across both, not two that drifted. The tier
// is resolved in JS because Phase 2's desktop surfaces (the dense holdings
// table, the multi-pane watchlist) need to *render* differently, not merely
// restyle, and a media query cannot change what React mounts.

import { useCallback, useEffect, useState } from 'react';

export type ShellTier = 'phone' | 'tablet' | 'desktop';

// Must stay in step with the `tablet` / `desktop` screens in
// tailwind.config.js — screens style content density, this resolves the tier
// for the cases CSS cannot reach. Same boundaries as StudyDesk's base.css.
const TABLET = '(min-width: 769px) and (max-width: 1200px)';
const DESKTOP = '(min-width: 1201px)';

function readTier(): ShellTier {
  // Defaults to the phone tier if matchMedia is unavailable: this app ships as
  // an Android WebView first, so the phone layout is the safe render.
  if (typeof window === 'undefined' || !window.matchMedia) return 'phone';
  if (window.matchMedia(DESKTOP).matches) return 'desktop';
  if (window.matchMedia(TABLET).matches) return 'tablet';
  return 'phone';
}

export function useShellTier(): ShellTier {
  const [tier, setTier] = useState<ShellTier>(readTier);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const lists = [window.matchMedia(TABLET), window.matchMedia(DESKTOP)];
    const onChange = () => setTier(readTier());
    lists.forEach((l) => l.addEventListener('change', onChange));
    // A resize that crossed a boundary between first paint and this effect
    // would otherwise leave the initial tier stale, so re-read once on mount.
    onChange();
    return () => lists.forEach((l) => l.removeEventListener('change', onChange));
  }, []);
  return tier;
}

// 'rail' | 'full' — absent means "follow the tier", the default for everyone
// who has never touched the toggle.
const RAIL_KEY = 'nexus-sidebar';

export function useSidebarRail(tier: ShellTier): [boolean, () => void] {
  const [pref, setPref] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem(RAIL_KEY);
      return v === 'rail' || v === 'full' ? v : null;
    } catch {
      return null;
    }
  });

  // Auto until the user says otherwise: 769–1200px cannot hold a 240px sidebar
  // and a usable content column at once; above 1200px it can. On phone the
  // sidebar is not rendered at all, so this value is inert there.
  const rail = pref ? pref === 'rail' : tier === 'tablet';

  const toggleRail = useCallback(() => {
    const next = rail ? 'full' : 'rail';
    try {
      localStorage.setItem(RAIL_KEY, next);
    } catch {
      /* private mode / quota — the toggle still works for this session */
    }
    setPref(next);
  }, [rail]);

  return [rail, toggleRail];
}
