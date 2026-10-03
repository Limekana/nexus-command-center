import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FDROID_PAGE, checkFdroidUpdate, dismissUpdate, useFdroidUpdate } from '../lib/fdroidUpdate';

// v1.16 (#48) — the "newer NCC on F-Droid" note. The logic, and why it is
// shaped the way it is, lives in src/lib/fdroidUpdate.ts.
//
// Inline at the top of the content column, on every route, never a modal and
// never over the page: an update is news, not an emergency, and one tap puts
// it away. A floating card would also contend with the referral prompt and
// the quick-log FAB for the same corner.
//
// Drawn in the instrument language: a flat panel, a `.sec` label, and the
// version change as a readout — the running version dim, the new one as the
// screen's single amber reading. The action is a ghost button so the version
// stays the only accent, as the palette note in tailwind.config.js asks.

// After first paint and the initial pull, so it never competes with startup.
const CHECK_DELAY_MS = 4000;

export default function FdroidUpdateNote() {
  const { t } = useTranslation();
  const { available } = useFdroidUpdate();

  useEffect(() => {
    const id = setTimeout(() => {
      void checkFdroidUpdate();
    }, CHECK_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  if (!available) return null;
  const { current, latest } = available;
  const latestLabel = latest.name || `#${latest.code}`;

  return (
    <aside aria-label={t('update.eyebrow')} className="panel p-3 mb-3 animate-fade-in-up">
      <div className="flex items-baseline justify-between gap-3">
        <div className="sec">{t('update.eyebrow')}</div>
        <div
          className="font-mono text-xs tabular-nums flex items-baseline gap-2"
          aria-label={t('update.versions', { current: current.name, latest: latestLabel })}
        >
          <span className="text-text-faint line-through">{current.name}</span>
          <span className="text-text-faint" aria-hidden="true">→</span>
          <span className="text-primary font-medium">{latestLabel}</span>
        </div>
      </div>
      <div className="font-heading text-sm text-text mt-1.5 mb-3">
        {t('update.title', { version: latestLabel })}
      </div>
      <div className="flex items-center gap-3">
        <a className="btn-ghost btn-sm no-underline" href={FDROID_PAGE} target="_blank" rel="noopener noreferrer">
          {t('update.open')}
        </a>
        <button type="button" onClick={dismissUpdate} className="sec hover:text-text-muted">
          {t('update.later')}
        </button>
      </div>
    </aside>
  );
}
