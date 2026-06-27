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
  }, [mode, biometricEnabled, bioAvailable, hasPin]);

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
    <div className="min-h-full flex flex-col items-center justify-center bg-bg p-6 safe-top safe-bottom">
      <div className="w-full max-w-xs flex flex-col items-center gap-6">
        <div className="text-center space-y-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted">{t('app.name')}</div>
          <h1 className="font-heading font-bold text-2xl text-text">{t('lock.secureAccess')}</h1>
          <div className="text-[10px] text-text-muted">{t('lock.deviceEncrypted')}</div>
        </div>

        <button
          onClick={tryBiometric}
          className={`w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl active:scale-95 ${
            bioAvailable && biometricEnabled
              ? 'border-primary/60 bg-primary/10 shadow-glow'
              : 'border-border bg-surface opacity-50'
          }`}
          aria-label={t('lock.bioAria')}
        >
          👆
        </button>
        <div className="text-[10px] text-text-muted -mt-2">
          {!biometricEnabled
            ? t('lock.bioDisabled')
            : bioAvailable
            ? t('lock.tapOrPin')
            : bioReason || t('lock.usePin')}
        </div>

        <div className={`flex flex-col items-center gap-4 w-full ${shake ? 'animate-pulse' : ''}`}>
          <div className="text-xs text-text-muted">{subtitle}</div>
          <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 rounded-full border-2 ${
                  i < code.length ? 'bg-primary border-primary' : 'border-border'
                }`}
              />
            ))}
          </div>
          {isLockedOut ? (
            <div className="text-xs text-danger text-center px-2">
              {t('lock.tooManyPrefix')}{' '}
              <span className="font-heading font-semibold">{secondsLeft}s</span>
            </div>
          ) : (
            error && <div className="text-xs text-danger">{error}</div>
          )}

          <div className={`grid grid-cols-3 gap-2 w-full mt-2 ${isLockedOut ? 'opacity-40 pointer-events-none' : ''}`}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                onClick={() => press(d)}
                disabled={isLockedOut}
                className="h-12 rounded-md bg-surface border border-border font-heading font-semibold text-lg active:bg-surface2"
              >
                {d}
              </button>
            ))}
            <button
              onClick={tryBiometric}
              className="h-12 rounded-md bg-surface border border-border text-text-muted text-xs active:bg-surface2"
            >
              {t('lock.bio')}
            </button>
            <button
              onClick={() => press('0')}
              disabled={isLockedOut}
              className="h-12 rounded-md bg-surface border border-border font-heading font-semibold text-lg active:bg-surface2"
            >
              0
            </button>
            <button
              onClick={back}
              disabled={isLockedOut}
              className="h-12 rounded-md bg-surface border border-border text-text-muted active:bg-surface2"
            >
              ⌫
            </button>
          </div>
        </div>

        <div className="text-[10px] text-text-muted/60">{t('lock.forgotPin')}</div>
      </div>
    </div>
  );
}
