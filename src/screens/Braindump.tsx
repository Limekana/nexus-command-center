import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import Glyph from '../components/Glyph';
import { useBraindumpStore } from '../store/useBraindumpStore';
import { BRAINDUMP_MAX_CHARS } from '../types/braindump';
import { formatShortDate } from '../utils/formatters';
import { compositionTracking, isComposing } from '../lib/imeSubmit';

/**
 * v1.12 Item 10 — Braindump.
 *
 * The capture box is the screen. It is mounted focused, it is the first thing
 * under the header, and it commits on Ctrl/Cmd+Enter — because the entire
 * premise is being faster than making a task, and anything that costs an extra
 * decision (a title field, a category, a due date) hands that advantage back.
 *
 * Enter alone deliberately does NOT submit: entries are free text and a
 * multi-line thought is the normal case, so Enter has to mean newline. That
 * also sidesteps the IME-composition class of bug entirely (issue #35) — there
 * is no Enter-to-submit handler here to guard.
 */
export default function Braindump() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const entries = useBraindumpStore((s) => s.entries);
  const load = useBraindumpStore((s) => s.load);
  const add = useBraindumpStore((s) => s.add);
  const remove = useBraindumpStore((s) => s.remove);
  const convertToTask = useBraindumpStore((s) => s.convertToTask);

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { boxRef.current?.focus(); }, []);

  const over = draft.length > BRAINDUMP_MAX_CHARS;
  const canSave = draft.trim().length > 0 && !over && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      // Clear optimistically only on success — if `add` refuses the text the
      // user must not lose what they typed.
      if (await add(draft)) setDraft('');
    } finally {
      setBusy(false);
      boxRef.current?.focus();
    }
  }

  return (
    <>
      <AppHeader title={t('domains.braindump')} back="/" backLabel={t('nav.home')} showAvatar={false} />

      <div className="space-y-5">
        <div className="panel p-4">
          <textarea
            ref={boxRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            {...compositionTracking}
            onKeyDown={(e) => {
              // Guarded even though the shortcut is Ctrl/Cmd+Enter rather than
              // plain Enter. The regression check flagged this and was right
              // to: a CJK user can hold a modifier while a candidate is still
              // uncommitted, and committing the draft then would save a
              // half-composed word — the same defect as issue #35, just
              // reached by a different keystroke.
              if (isComposing(e)) return;
              // Ctrl/Cmd+Enter commits. Plain Enter is a newline, on purpose.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void save();
              }
            }}
            placeholder={t('braindump.placeholder')}
            rows={4}
            className="w-full bg-transparent resize-y text-sm leading-relaxed outline-none"
            aria-label={t('braindump.placeholder')}
          />
          <div className="flex items-center justify-between mt-3 gap-3">
            <div className="text-[0.625rem] uppercase tracking-wider text-text-muted">
              {over
                ? t('braindump.tooLong', { max: BRAINDUMP_MAX_CHARS })
                : t('braindump.hint')}
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              className="btn btn-sm press-spring disabled:opacity-40"
            >
              {t('braindump.save')}
            </button>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="panel p-8 text-center">
            <div className="font-heading text-base font-semibold mb-1">
              {t('braindump.emptyTitle')}
            </div>
            <div className="text-xs text-text-muted">{t('braindump.emptyBody')}</div>
          </div>
        ) : (
          <section className="space-y-2 stagger-children">
            <div className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted px-1">
              {t('braindump.recent', { count: entries.length })}
            </div>
            {entries.map((e) => (
              <div key={e.id} className="panel p-3">
                {/* Rendered as text, never as HTML. Single-user and RLS-scoped,
                    so the blast radius is small, but free text renders escaped
                    here as a matter of course. */}
                <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {e.content}
                </div>
                <div className="flex items-center justify-between mt-3 gap-2">
                  <div className="text-[0.625rem] uppercase tracking-wider text-text-muted">
                    {formatShortDate(e.createdAt)}
                    {e.convertedTaskId && ` · ${t('braindump.converted')}`}
                  </div>
                  <div className="flex gap-1.5">
                    {e.convertedTaskId ? (
                      <button
                        type="button"
                        onClick={() => navigate('/tasks')}
                        className="pill press-spring text-[0.625rem]"
                      >
                        {t('braindump.viewTask')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void convertToTask(e.id)}
                        className="pill press-spring text-[0.625rem]"
                      >
                        {t('braindump.convert')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void remove(e.id)}
                      aria-label={t('common.delete')}
                      className="pill press-spring inline-flex items-center justify-center"
                    >
                      <Glyph name="close" size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
