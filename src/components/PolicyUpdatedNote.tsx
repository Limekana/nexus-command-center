import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { POLICY_URL, acknowledgePolicy, policyNoticeDue } from '../lib/policyNotice';

// v1.16 (limecore#16, #50) — the one-time "privacy policy updated" strip. See
// lib/policyNotice.ts for who sees it. Sits where the offline strip sits, in
// the same flat panel, and goes away for good on either action.
export default function PolicyUpdatedNote() {
  const { t } = useTranslation();
  const [due, setDue] = useState(policyNoticeDue);
  if (!due) return null;
  const close = () => {
    acknowledgePolicy();
    setDue(false);
  };
  return (
    <div className="px-3 pt-2 safe-top">
      <aside aria-label={t('policy.eyebrow')} className="panel max-w-md mx-auto p-3 animate-fade-in-up">
        <div className="sec">{t('policy.eyebrow')}</div>
        <p className="text-xs text-text mt-1.5">{t('policy.body')}</p>
        <div className="flex items-center gap-3 mt-2.5">
          <a className="btn-ghost btn-sm no-underline" href={POLICY_URL} target="_blank" rel="noopener noreferrer" onClick={close}>
            {t('policy.read')}
          </a>
          <button type="button" onClick={close} className="sec hover:text-text-muted">
            {t('policy.ok')}
          </button>
        </div>
      </aside>
    </div>
  );
}
