import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../store/useSessionStore';
import {
  REFERRAL_OPTIONS,
  REFERRAL_DISMISSED,
  recordReferralSource,
  shouldAskReferral,
} from '../lib/referralSource';

// Item 8 — asks once, ever, then gets out of the way. See referralSource.ts
// for why this is self-reported and why it lives in auth metadata.
//
// Deliberately NOT a modal, unlike AdoptionPrompt next to it. That one blocks
// because it is about data the user could otherwise lose. This one fires on a
// brand-new account's first real session — precisely the moment activation is
// decided — and a blocking overlay demanding an answer before the app can be
// used would damage the number it exists to measure. It is a corner panel
// that can be ignored outright.
//
// Palette note: no amber anywhere here. The signal colour marks the live
// reading, and a survey card is not one.
export default function ReferralPrompt() {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!shouldAskReferral(user)) return;
    // Short beat before appearing, so this reads as an aside rather than the
    // next step of onboarding — which is what would make people answer at
    // random just to clear it.
    const id = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(id);
  }, [user]);

  if (!visible || !user) return null;

  const answer = (source: string) => {
    recordReferralSource(user, source);
    // Leave the acknowledgement up briefly so the tap has a result; `closing`
    // also unmounts the buttons, so a double-tap cannot fire a second write
    // against a now-stale hasReferralSource read.
    setClosing(true);
    setTimeout(() => setVisible(false), 900);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('referral.title')}
      className="fixed z-40 bottom-[calc(64px+env(safe-area-inset-bottom))] tablet:bottom-6
                 inset-x-3 tablet:inset-x-auto tablet:end-6 tablet:w-[19rem]
                 bg-surface2 border border-border rounded-md p-4"
    >
      {closing ? (
        <div className="text-sm text-text py-1">{t('referral.thanks')}</div>
      ) : (
        <>
          <div className="sec">{t('referral.eyebrow')}</div>
          <div className="font-heading text-sm text-text mt-1.5 mb-3">{t('referral.title')}</div>
          <div className="flex flex-col gap-1.5">
            {REFERRAL_OPTIONS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => answer(key)}
                className="w-full text-start px-3 py-2 rounded-sm border border-border bg-surface
                           text-sm text-text transition-colors active:bg-surface2 hover:border-border"
              >
                {t(`referral.opt.${key}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => answer(REFERRAL_DISMISSED)}
            className="sec mt-3 ms-auto block hover:text-text-muted"
          >
            {t('referral.dismiss')}
          </button>
        </>
      )}
    </div>
  );
}
