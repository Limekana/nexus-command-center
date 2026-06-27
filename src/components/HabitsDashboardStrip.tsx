// ─── v1.2 Habits dashboard strip ────────────────────────────────────────
//
// Compact horizontal scroll of TODAY'S eligible habits — rendered ABOVE the
// Overview stat grid on the Dashboard. Rest-day (specific-days-off) habits
// are intentionally hidden here to keep the strip from showing rings the
// user can't act on today.
//
// Tap on any habit → /habits with the row scrolled in view (anchored via
// hash). Tap on the header → /habits unanchored. Empty state surfaces a
// CTA to /habits/add.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HabitRing from './HabitRing';
import { useHabitsStore } from '../store/useHabitsStore';
import { isEligibleOn, dateKey } from '../lib/habitStreaks';

export default function HabitsDashboardStrip() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const habits = useHabitsStore((s) => s.habits);
  const completions = useHabitsStore((s) => s.completions);

  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  // Active habits (exclude archived); only those eligible today.
  const eligible = useMemo(
    () => habits.filter((h) => !h.archivedAt && isEligibleOn(h, today)),
    [habits, today],
  );

  // Empty state: no active habits at all, OR none eligible today.
  // v1.2 UI/UX review #1 — both fallback CTAs are real <button>s so they
  // participate in keyboard nav (Enter/Space) and read as actionable to
  // screen readers, instead of being mute clickable <div>s.
  if (habits.filter((h) => !h.archivedAt).length === 0) {
    return (
      <button
        type="button"
        onClick={() => navigate('/habits/add')}
        className="glass rounded-xl p-4 flex items-center justify-between press-spring text-left w-full"
      >
        <div className="min-w-0">
          <div className="font-heading font-semibold text-sm">{t('dash.buildHabitTitle')}</div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {t('dash.buildHabitBody')}
          </div>
        </div>
        <div className="pill pill-on flex-shrink-0 ml-3">{t('dash.addHabit')}</div>
      </button>
    );
  }

  if (eligible.length === 0) {
    return (
      <button
        type="button"
        onClick={() => navigate('/habits')}
        className="glass rounded-xl p-4 press-spring text-left w-full block"
      >
        <div className="font-heading font-semibold text-sm">{t('dash.habits')}</div>
        <div className="text-[11px] text-text-muted mt-0.5">
          {t('dash.nothingToday')}
        </div>
      </button>
    );
  }

  // Counts for the header
  const completedToday = eligible.filter((h) => {
    const c = completions.find((c) => c.habitId === h.id && c.date === todayKey);
    if (!c) return false;
    if (h.type === 'binary') return c.amount > 0;
    const target = h.targetAmount && h.targetAmount > 0 ? h.targetAmount : 1;
    return c.amount >= target;
  }).length;

  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-baseline justify-between mb-2">
        <button
          type="button"
          onClick={() => navigate('/habits')}
          className="font-heading font-semibold text-sm press-spring"
        >
          {t('dash.habitsToday')}
        </button>
        <div className="text-[10px] text-text-muted uppercase tracking-wider">
          {t('dash.doneOfTotal', { done: completedToday, total: eligible.length })}
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 stagger-children">
        {eligible.map((h) => {
          const c = completions.find((c) => c.habitId === h.id && c.date === todayKey);
          const amount = c?.amount ?? 0;
          const target =
            h.type === 'binary' ? 1 : Math.max(1, h.targetAmount ?? 1);
          const progress = h.type === 'binary' ? (amount > 0 ? 1 : 0) : amount / target;
          const state =
            progress >= 1 ? 'done' : progress > 0 ? 'partial' : 'idle';
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => navigate('/habits')}
              className="flex flex-col items-center gap-1 flex-shrink-0 press-spring w-14"
            >
              <HabitRing
                progress={progress}
                state={state}
                size={48}
                strokeWidth={4}
                color={h.color}
              />
              <div className="text-[10px] text-text-muted truncate max-w-full leading-tight">
                {h.title}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
