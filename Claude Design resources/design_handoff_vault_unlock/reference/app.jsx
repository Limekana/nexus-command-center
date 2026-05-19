/* ─── App orchestration: lock → iris → dashboard ─── */

const { useState, useEffect, useRef, useCallback } = React;

const SESSION_KEY = 'nexus.coldStartConsumed';

function NexusApp({ tweaks }) {
  // Phases: 'locked' → 'unlocking' → 'unlocked'
  const [phase, setPhase] = useState('locked');
  // Whether iris should play on next unlock (only first unlock per session).
  const [animateNext, setAnimateNext] = useState(true);
  // Cache reduced-motion at mount; the tweaks panel can override.
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    // Cold-start detection: sessionStorage survives reload but not browser quit.
    // (In the native app this maps to "fresh app launch".)
    const consumed = sessionStorage.getItem(SESSION_KEY) === '1';
    setAnimateNext(!consumed);

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const fn = (e) => setPrefersReduced(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const handleUnlock = useCallback(() => {
    // Decide instant vs animated.
    const enabled = tweaks.animationEnabled;
    const reduced = prefersReduced || tweaks.simulateReducedMotion;
    const shouldAnimate = enabled && !reduced && animateNext;

    if (shouldAnimate) {
      setPhase('unlocking');
      sessionStorage.setItem(SESSION_KEY, '1');
      setAnimateNext(false);
    } else {
      setPhase('unlocked');
      // Still mark as consumed so subsequent unlocks (in this session) stay instant.
      sessionStorage.setItem(SESSION_KEY, '1');
      setAnimateNext(false);
    }
  }, [tweaks.animationEnabled, tweaks.simulateReducedMotion, prefersReduced, animateNext]);

  const handleLockAgain = useCallback(() => {
    setPhase('locked');
    // Animate-next stays false: subsequent unlocks in same session are instant.
  }, []);

  const handleForceColdStart = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setAnimateNext(true);
    setPhase('locked');
  }, []);

  const onIrisComplete = useCallback(() => setPhase('unlocked'), []);

  // Stage: the dashboard is mounted alongside the iris during 'unlocking'
  // so it can fade in at REVEAL_DELAY behind the retracting blades.
  const showDashboard = phase === 'unlocking' || phase === 'unlocked';
  const dashboardRevealed = phase === 'unlocked' ||
    (phase === 'unlocking'); // CSS transition handles the timing

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
      {/* Dashboard sits underneath the iris */}
      {showDashboard && (
        <Dashboard
          revealed={dashboardRevealed}
          onLockAgain={handleLockAgain}
          onReplay={handleForceColdStart}
        />
      )}

      {/* Lock screen is shown only when locked */}
      {phase === 'locked' && <LockScreen onUnlock={handleUnlock} />}

      {/* Iris animation overlay during unlocking */}
      {phase === 'unlocking' && (
        <VaultUnlock
          onComplete={onIrisComplete}
          blades={tweaks.bladeCount}
          duration={tweaks.duration}
          scanlineColor={tweaks.scanlineColor}
          scanlineGlow={tweaks.scanlineGlow}
          coreColor={VAULT_DEFAULTS.CORE_COLOR}
          irisFill={VAULT_DEFAULTS.IRIS_FILL}
        />
      )}
    </div>
  );
}

window.NexusApp = NexusApp;
