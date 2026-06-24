// Cross-module weekly summary. Pulls aggregations from each module's store
// (via the buildWeeklyReview helper) and renders a one-screen recap.
//
// Layout:
//   - Header with the week range and a Prev/Next stepper
//   - Insights bullets (cross-module observations) at the top — these are
//     the most "newsworthy" items, so they get prime real estate
//   - 4 module cards (Finance / Studies / Fitness / Tasks) with their
//     biggest numbers + a deltaLabel vs last week
//   - Footer note explaining the Sunday notification + link to Settings
//
// The screen is fully derived data — no Dexie writes. Each card tap routes
// to that module's overview so the user can drill in.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useFinanceStore } from '../store/useFinanceStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useTaskStore } from '../store/useTaskStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { buildWeeklyReview, startOfWeek } from '../lib/weeklyReview';

function formatRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const day = (d: Date) => d.getDate();
  const month = (d: Date) =>
    new Intl.DateTimeFormat('fi-FI', { month: 'short' }).format(d);
  const year = (d: Date) => d.getFullYear();
  if (sameMonth) {
    return `${day(start)}–${day(end)} ${month(end)} ${year(end)}`;
  }
  return `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${year(end)}`;
}

function formatHours(min: number): string {
  if (min <= 0) return '0';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const TONE_STYLES = {
  positive: 'border-success/40 bg-success/5 text-success',
  warn: 'border-warning/40 bg-warning/5 text-warning',
  neutral: 'border-border bg-surface2/40 text-text-muted',
};

export default function WeeklyReview() {
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const budgetCategories = useFinanceStore((s) => s.budgetCategories);
  const holdings = useFinanceStore((s) => s.holdings);
  const courses = useStudiesStore((s) => s.courses);
  const studySessions = useStudiesStore((s) => s.studySessions);
  const currentImport = useStudiesStore((s) => s.currentImport);
  const workouts = useFitnessStore((s) => s.sessions);
  const tasks = useTaskStore((s) => s.tasks);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  // Allow stepping backwards through prior weeks (useful for catching up on
  // a missed Sunday). +N moves forward; we clamp at the current week so the
  // user can't peek into the future.
  const [weekOffset, setWeekOffset] = useState(0);
  const currentWeekStart = useMemo(() => {
    const base = startOfWeek();
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
  }, [weekOffset]);

  const data = useMemo(
    () =>
      buildWeeklyReview({
        weekStart: currentWeekStart,
        transactions,
        courses,
        sessions: studySessions,
        workouts,
        tasks,
        currentGpa: currentImport?.calculatedGpa ?? null,
        holdings,
      }),
    [
      currentWeekStart,
      transactions,
      courses,
      studySessions,
      workouts,
      tasks,
      currentImport,
      holdings,
    ],
  );

  const fmtMoney = (amount: number): string =>
    new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: baseCurrency,
      maximumFractionDigits: 0,
    }).format(amount);

  const topCategoryName = data.finance.topCategoryId
    ? budgetCategories.find((c) => c.id === data.finance.topCategoryId)?.name ?? '—'
    : null;

  return (
    <>
      <AppHeader title="Weekly Review" back="/" backLabel="Home" showAvatar={false} />
      <div className="space-y-3">
        {/* Week stepper */}
        <div className="card flex items-center justify-between">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
          >
            ← Prev
          </button>
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-[0.2em] text-text-muted">
              Week
            </div>
            <div className="font-heading font-semibold text-sm">
              {formatRange(data.weekStart, data.weekEnd)}
            </div>
          </div>
          <button
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset >= 0}
            className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary disabled:opacity-30"
          >
            Next →
          </button>
        </div>

        {/* Insights */}
        {data.insights.length > 0 && (
          <div className="card">
            <div className="font-heading font-semibold text-sm mb-2">Highlights</div>
            <div className="space-y-1.5">
              {data.insights.map((insight, i) => (
                <div
                  key={i}
                  className={`text-xs px-2 py-1.5 rounded-sm border ${TONE_STYLES[insight.tone]}`}
                >
                  {insight.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Finance */}
        <button
          onClick={() => navigate('/finance')}
          className="card text-left w-full active:bg-surface2/40"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-semibold text-sm">💰 Finance</span>
            <span className="text-[9px] uppercase tracking-wider text-primary border border-primary/40 rounded-sm px-1.5 py-0.5">
              Open
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Spend</div>
              <div className="font-heading font-bold text-base">{fmtMoney(data.finance.spend)}</div>
              <div className="text-[9px] text-text-muted">{data.finance.spendDelta}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Income</div>
              <div className="font-heading font-bold text-base">{fmtMoney(data.finance.income)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Tx</div>
              <div className="font-heading font-bold text-base">{data.finance.txCount}</div>
            </div>
          </div>
          {topCategoryName && (
            <div className="text-[10px] text-text-muted mt-2">
              Top category: {topCategoryName} · {fmtMoney(data.finance.topCategoryAmount)}
            </div>
          )}
        </button>

        {/* Studies — read-only summary (the dedicated screen was removed in
            the v1.3 scope reduction; this stays as a signal recap). */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-semibold text-sm">📚 Studies</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Studied</div>
              <div className="font-heading font-bold text-base">
                {formatHours(data.studies.studyMinutes)}
              </div>
              <div className="text-[9px] text-text-muted">{data.studies.minutesDelta}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Sessions</div>
              <div className="font-heading font-bold text-base">{data.studies.sessionCount}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">GPA</div>
              <div className="font-heading font-bold text-base">
                {data.studies.gpa != null ? data.studies.gpa.toFixed(2) : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Fitness — read-only summary (the dedicated screen was removed in
            the v1.3 scope reduction; this stays as a signal recap). */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-semibold text-sm">🏋️ Fitness</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Workouts</div>
              <div className="font-heading font-bold text-base">{data.fitness.workoutCount}</div>
              <div className="text-[9px] text-text-muted">{data.fitness.workoutsDelta}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Sets</div>
              <div className="font-heading font-bold text-base">{data.fitness.totalSets}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Volume</div>
              <div className="font-heading font-bold text-base">
                {data.fitness.totalVolumeKg > 0
                  ? `${Math.round(data.fitness.totalVolumeKg).toLocaleString('fi-FI')} kg`
                  : '—'}
              </div>
            </div>
          </div>
          {data.fitness.topExercise && (
            <div className="text-[10px] text-text-muted mt-2">
              Most-trained: {data.fitness.topExercise} · {data.fitness.topExerciseSets} sets
            </div>
          )}
        </div>

        {/* Tasks */}
        <button
          onClick={() => navigate('/tasks')}
          className="card text-left w-full active:bg-surface2/40"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-semibold text-sm">✓ Tasks</span>
            <span className="text-[9px] uppercase tracking-wider text-primary border border-primary/40 rounded-sm px-1.5 py-0.5">
              Open
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Completed</div>
              <div className="font-heading font-bold text-base">{data.tasks.completed}</div>
              <div className="text-[9px] text-text-muted">{data.tasks.completedDelta}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">New</div>
              <div className="font-heading font-bold text-base">{data.tasks.created}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-text-muted">Open</div>
              <div className="font-heading font-bold text-base">{data.tasks.stillOpen}</div>
            </div>
          </div>
          {data.tasks.overdue > 0 && (
            <div className="text-[10px] text-danger mt-2">
              ⚠ {data.tasks.overdue} overdue
            </div>
          )}
        </button>

        <button
          onClick={() => navigate('/review/year')}
          className="card w-full text-left active:bg-surface2/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-heading font-semibold text-sm">📅 Year in Review</div>
              <div className="text-[10px] text-text-muted mt-0.5">
                Rolling 12-month recap with heatmaps + top rankings
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-primary border border-primary/40 rounded-sm px-2 py-0.5">
              Open
            </span>
          </div>
        </button>

        <div className="card text-center text-[10px] text-text-muted">
          Sunday evenings at 18:00 you get a push reminder to open this.
          Toggle in Settings → Notifications.
        </div>
      </div>
    </>
  );
}

