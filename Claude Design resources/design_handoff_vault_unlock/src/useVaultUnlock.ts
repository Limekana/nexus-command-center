/* useVaultUnlock.ts — gating hook for the iris unlock animation.
 *
 * Responsibilities (per PRD):
 *   1. Play the 870ms iris ONLY on the first unlock per app launch.
 *      Subsequent unlocks in the same session are instant.
 *   2. Respect OS-level `prefers-reduced-motion` → instant always.
 *   3. Respect a user-controlled "Unlock Animation" setting → instant when off.
 *
 * Usage (in your unlock screen):
 *
 *   const { shouldPlayIris, consume } = useVaultUnlock({
 *     enabledInSettings: settings.unlockAnimation,
 *   });
 *
 *   async function onUnlock() {
 *     const ok = await authenticate();
 *     if (!ok) return;
 *     if (shouldPlayIris) {
 *       setPlayingIris(true);   // mount <VaultUnlock playing />
 *       consume();              // mark the cold-start as spent
 *     } else {
 *       navigateToDashboard();  // instant
 *     }
 *   }
 *
 *   // when <VaultUnlock onComplete> fires:
 *   //   setPlayingIris(false); navigateToDashboard();
 *
 * Cold-start detection notes:
 *   - On WEB (PWA), use sessionStorage: it survives reload but not browser
 *     quit, which is close enough to "fresh app launch" for the MVP.
 *   - On NATIVE (Capacitor), prefer an in-memory module flag — sessionStorage
 *     persists across an Activity recreate on Android, which is NOT what
 *     you want. See COLD_START_STRATEGY below for the swap point.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Module-level flag — survives component remount within one JS bundle load,
// dies on full app restart. This is the right primitive on native.
let COLD_START_CONSUMED = false;

const SESSION_KEY = 'nexus.coldStartConsumed';

/** Set to 'memory' on native (Capacitor), 'session' on plain web. */
const COLD_START_STRATEGY: 'memory' | 'session' = 'memory';

function readConsumed(): boolean {
  if (COLD_START_STRATEGY === 'session') {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return COLD_START_CONSUMED;
    }
  }
  return COLD_START_CONSUMED;
}

function writeConsumed(): void {
  COLD_START_CONSUMED = true;
  if (COLD_START_STRATEGY === 'session') {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore — module flag still gates it */
    }
  }
}

export type UseVaultUnlockOptions = {
  /** Settings → Security → "Unlock Animation" toggle. */
  enabledInSettings: boolean;
};

export type UseVaultUnlockResult = {
  /** True iff the iris should play on the next unlock. */
  shouldPlayIris: boolean;
  /**
   * Mark the cold-start animation as spent. Call this the moment you decide
   * to play the iris (i.e. before mounting <VaultUnlock playing />).
   * Subsequent reads of shouldPlayIris will be false until the app fully
   * relaunches.
   */
  consume: () => void;
  /** Test/dev-only: reset the cold-start flag. Don't call in production. */
  reset: () => void;
};

export function useVaultUnlock(
  { enabledInSettings }: UseVaultUnlockOptions,
): UseVaultUnlockResult {
  const [prefersReduced, setPrefersReduced] = useState(false);
  const [consumed, setConsumed] = useState(() => readConsumed());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const fn = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const consume = useCallback(() => {
    writeConsumed();
    setConsumed(true);
  }, []);

  const reset = useCallback(() => {
    COLD_START_CONSUMED = false;
    if (COLD_START_STRATEGY === 'session') {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    }
    setConsumed(false);
  }, []);

  const shouldPlayIris = enabledInSettings && !prefersReduced && !consumed;

  return { shouldPlayIris, consume, reset };
}
