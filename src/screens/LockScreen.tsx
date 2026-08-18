import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { authenticateBiometric, biometricCapability } from '../utils/biometric';

export default function LockScreen() {
  const { t } = useTranslation();
  const hasPin = useAuthStore((s) => s.hasPin);
  const setPin = useAuthStore((s) => s.setPin);
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const unlock = useAuthStore((s) => s.unlock);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const lockedUntil = useAuthStore((s) => s.lockedUntil);

  const [mode, setMode] = useState<'enter' | 'set' | 'confirm'>(hasPin ? 'enter' : 'set');
  const [code, setCode] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioReason, setBioReason] = useState<string>('');
  // Countdown tick during a brute-force lockout — re-renders the secondsLeft
  // each second so the user sees a live "Try again in 28s" instead of stale.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);
  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  const isLockedOut = secondsLeft > 0;

  useEffect(() => {
    setMode(hasPin ? 'enter' : 'set');
  }, [hasPin]);

  useEffect(() => {
    biometricCapability().then((c) => {
      setBioAvailable(c.available);
      setBioReason(c.reason);
    });
  }, []);

  // Auto-prompt biometric on mount if enabled, available, and PIN is set.
  useEffect(() => {
    if (mode !== 'enter' || !biometricEnabled || !bioAvailable || !hasPin) return;
    let cancelled = false;
    (async () => {
      const result = await authenticateBiometric();
      if (cancelled) return;
      if (result.ok) {
        unlock();
      } else if (result.reason) {
        setError(result.reason);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, biometricEnabled, bioAvailable, hasPin, unlock]);

  const press = (digit: string) => {
    if (isLockedOut) return; // no-op while in cooldown
    setError(null);
    if (code.length >= 6) return;
    setCode(code + digit);
  };
  const back = () => {
    if (isLockedOut) return;
    setCode(code.slice(0, -1));
  };

  useEffect(() => {
    if (code.length !== 6) return;
    (async () => {
      if (mode === 'enter') {
        const result = await verifyPin(code);
        if (result.ok) {
          unlock();
        } else if (result.locked) {
          // Brute-force lockout active. The countdown effect above will tick
          // the visible seconds; here we just set a stable message.
          setError(
            t('lock.tooManyError', { secs: Math.ceil(result.locked.remainingSeconds) }),
          );
          setShake(true);
          setTimeout(() => setShake(false), 400);
          setCode('');
        } else {
          setError(t('lock.wrongPin'));
          setShake(true);
          setTimeout(() => setShake(false), 400);
          setCode('');
        }
      } else if (mode === 'set') {
        setFirst(code);
        setCode('');
        setMode('confirm');
      } else if (mode === 'confirm') {
        if (code === first) {
          await setPin(code);
          unlock();
        } else {
          setError(t('lock.pinsNoMatch'));
          setShake(true);
          setTimeout(() => setShake(false), 400);
          setFirst('');
          setCode('');
          setMode('set');
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on `code` only: this effect calls setMode()/setFirst() itself mid-run, so adding `mode`/`first` would make it re-trigger on its own state transitions rather than on new digit entry. unlock/verifyPin/setPin are stable actions, t is stable from i18next.
  }, [code]);

  const tryBiometric = async () => {
    if (!biometricEnabled) {
      setError(t('lock.bioDisabledErr'));
      return;
    }
    if (!bioAvailable) {
      setError(bioReason || t('lock.bioUnavailable'));
      return;
    }
    if (!hasPin) {
      setError(t('lock.setPinFirst'));
      return;
    }
    const result = await authenticateBiometric();
    if (result.ok) {
      unlock();
    } else if (result.reason) {
      setError(result.reason);
    }
  };

  const subtitle =
    mode === 'enter' ? t('lock.enterPin') :
    mode === 'set' ? t('lock.setPin') :
    t('lock.confirmPin');

  return (
    // v1.9 Item 14 — the lock screen is outside AppShell (it renders instead
    // of it, from App.tsx), so it never picked up any of the desktop shell
    // work and stayed a 320px phone column marooned in the middle of a large
    // dark window. It scales up per tier now. It stays centred rather than
    // going full-bleed: a keypad stretched across 2560px would be worse than
    // a small one, not better. What it gains is presence — a 576px column
    // with 80px keys reads as a deliberate desktop lock, not a phone screenshot.
    <div className="min-h-full flex flex-col items-center justify-center bg-bg p-6 desktop:p-10 safe-top safe-bottom">
      <div className="w-full max-w-xs tablet:max-w-sm desktop:max-w-xl flex flex-col items-center gap-6 desktop:gap-9">
        <div className="text-center space-y-1 desktop:space-y-2">
          <div className="text-[0.625rem] desktop:text-xs uppercase tracking-[0.2em] text-text-muted">{t('app.name')}</div>
          <h1 className="font-heading font-bold text-2xl desktop:text-4xl text-text">{t('lock.secureAccess')}</h1>
          <div className="text-[0.625rem] desktop:text-sm text-text-muted">{t('lock.deviceEncrypted')}</div>
        </div>

        <button
          onClick={tryBiometric}
          className={`w-16 h-16 desktop:w-24 desktop:h-24 rounded-full border-2 flex items-center justify-center text-2xl desktop:text-4xl active:scale-95 ${
            bioAvailable && biometricEnabled
              ? 'border-border bg-surface2'
              : 'border-border bg-surface opacity-50'
          }`}
          aria-label={t('lock.bioAria')}
        >
          👆
        </button>
        <div className="text-[0.625rem] desktop:text-sm text-text-muted -mt-2">
          {!biometricEnabled
            ? t('lock.bioDisabled')
            : bioAvailable
            ? t('lock.tapOrPin')
            : bioReason || t('lock.usePin')}
        </div>

        <div className={`flex flex-col items-center gap-4 desktop:gap-6 w-full ${shake ? 'animate-pulse' : ''}`}>
          <div className="text-xs desktop:text-base text-text-muted">{subtitle}</div>
          <div className="flex gap-3 desktop:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 desktop:w-4 desktop:h-4 rounded-full border-2 ${
                  i < code.length ? 'bg-primary border-primary' : 'border-border'
                }`}
              />
            ))}
          </div>
          {isLockedOut ? (
            <div className="text-xs desktop:text-sm text-danger text-center px-2">
              {t('lock.tooManyPrefix')}{' '}
              <span className="font-heading font-semibold">{secondsLeft}s</span>
            </div>
          ) : (
            error && <div className="text-xs desktop:text-sm text-danger">{error}</div>
          )}

          <div className={`grid grid-cols-3 gap-2 desktop:gap-4 w-full mt-2 ${isLockedOut ? 'opacity-40 pointer-events-none' : ''}`}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                onClick={() => press(d)}
                disabled={isLockedOut}
                className="h-12 desktop:h-20 rounded-md desktop:rounded-md bg-surface border border-border font-mono tabular-nums font-medium text-lg desktop:text-3xl active:bg-surface2 desktop:hover:bg-surface2 desktop:hover:border-primary/40 transition-colors"
              >
                {d}
              </button>
            ))}
            <button
              onClick={tryBiometric}
              className="h-12 desktop:h-20 rounded-md desktop:rounded-md bg-surface border border-border text-text-muted text-xs desktop:text-base active:bg-surface2 desktop:hover:bg-surface2 transition-colors"
            >
              {t('lock.bio')}
            </button>
            <button
              onClick={() => press('0')}
              disabled={isLockedOut}
              className="h-12 desktop:h-20 rounded-md desktop:rounded-md bg-surface border border-border font-mono tabular-nums font-medium text-lg desktop:text-3xl active:bg-surface2 desktop:hover:bg-surface2 desktop:hover:border-primary/40 transition-colors"
            >
              0
            </button>
            <button
              onClick={back}
              disabled={isLockedOut}
              className="h-12 desktop:h-20 rounded-md desktop:rounded-md bg-surface border border-border text-text-muted text-base desktop:text-2xl active:bg-surface2 desktop:hover:bg-surface2 transition-colors"
            >
              ⌫
            </button>
          </div>
        </div>

        <div className="text-[0.625rem] desktop:text-xs text-text-muted/60">{t('lock.forgotPin')}</div>
      </div>
    </div>
  );
}
