import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import pkg from '../../../package.json';
import { enqueue } from '../../db/syncQueue';
import { generateId } from '../../utils/uuid';
import { useSessionStore } from '../../store/useSessionStore';
import Glyph from '../../components/Glyph';
import { Section } from './parts';

// Settings > Feedback. Split out of Settings.tsx with its state (limecore#12).
export default function FeedbackSection() {
  const { t } = useTranslation();
  const user = useSessionStore((s) => s.user);
  // ── Feedback (v1.10) ──────────────────────────────────────────────────
  // Queued through the existing syncQueue rather than posted directly, so a
  // report written with no signal survives to the next drain. enqueue() is
  // fire-and-forget by design; a delivery problem surfaces in the sync banner
  // like every other queued write.
  const FEEDBACK_CATEGORIES = ['bug', 'idea', 'praise', 'other'] as const;
  const FEEDBACK_MAX = 4000;
  const [fbCategory, setFbCategory] = useState<string>('bug');
  const [fbRating, setFbRating] = useState(0);
  const [fbMessage, setFbMessage] = useState('');
  const [fbNotice, setFbNotice] = useState<string | null>(null);

  return (
    <Section title={t('settings.feedback')}>
      <p className="text-sm text-muted mb-3">{t('settings.feedbackBlurb')}</p>

      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label={t('settings.feedbackCategory')}>
        {FEEDBACK_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={fbCategory === c ? 'pill pill-active' : 'pill'}
            onClick={() => setFbCategory(c)}
            aria-pressed={fbCategory === c}
          >
            {t(`settings.fbCat.${c}`)}
          </button>
        ))}
      </div>

      <div className="flex gap-1 mb-3" role="group" aria-label={t('settings.feedbackRating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= fbRating ? 'text-xl text-accent' : 'text-xl text-muted'}
            onClick={() => setFbRating(n === fbRating ? 0 : n)}
            aria-label={t('settings.feedbackRatingN', { n })}
            aria-pressed={n <= fbRating}
          >
            <Glyph name="star" size={18} filled={n <= fbRating} />
          </button>
        ))}
      </div>

      <textarea
        className="input w-full min-h-[98px] resize-y"
        value={fbMessage}
        maxLength={FEEDBACK_MAX}
        onChange={(e) => {
          setFbMessage(e.target.value);
          if (fbNotice) setFbNotice(null);
        }}
        placeholder={t('settings.feedbackPlaceholder')}
        aria-label={t('settings.feedback')}
      />
      <div className="text-xs text-muted text-right mt-1">
        {fbMessage.length}/{FEEDBACK_MAX}
      </div>

      <button
        className="btn-ghost w-full mt-2"
        disabled={!fbMessage.trim()}
        onClick={() => {
          const body = fbMessage.trim();
          if (!body) { setFbNotice(t('settings.feedbackEmpty')); return; }
          if (!user) { setFbNotice(t('settings.feedbackSignIn')); return; }
          const id = generateId();
          void enqueue('feedback', id, 'insert', {
            id,
            category: fbCategory,
            rating: fbRating || null,
            message: body,
            appVersion: pkg.version,
            platform: Capacitor.getPlatform(),
          });
          setFbMessage('');
          setFbRating(0);
          setFbNotice(t('settings.feedbackThanks'));
        }}
      >
        {t('settings.feedbackSend')}
      </button>

      {fbNotice && <p className="text-sm text-muted mt-2">{fbNotice}</p>}
      <p className="text-xs text-muted mt-2">
        {t('settings.feedbackMeta', { app: 'Nexus Command Center', version: pkg.version })}
      </p>
    </Section>
  );
}
