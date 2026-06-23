// Rolling 12-month review. Shows trailing-365-day totals + heatmaps + the
// top-N rankings (categories, exercises). Anchor date is settable so the
// user can pull up "what did I do between Aug 2024 and Aug 2025" without
// waiting for a calendar boundary.
//
// Reuses HeatmapCalendar (Phase 1) so per-domain activity is visible at a
// glance — 365 cells per module, plus the totals at the top.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import HeatmapCalendar from '../components/HeatmapCalendar';
import { useFinanceStore } from '../store/useFinanceStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useTaskStore } from '../store/useTaskStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { buildYearReview } from '../lib/yearReview';

const TONE_STYLES = {
  positive: 'border-success/40 bg-success/5 text-success',
  warn: 'border-warning/40 bg-warning/5 text-warning',
  neutral: 'border-border bg-surface2/40 text-text-muted',
};

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('fi-FI', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  return `${fmt(start)} → ${fmt(end)}`;
}

export default function YearReview() {
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const budgetCategories = useFinanceStore((s) => s.budgetCategories);
  const holdings = useFinanceStore((s) => s.holdings);
  const manualAssets = useFinanceStore((s) => s.manualAssets);
  const courses = useStudiesStore((s) => s.courses);
  const sessions = useStudiesStore((s) => s.studySessions);
  const workouts = useFitnessStore((s) => s.sessions);
  const tasks = useTaskStore((s) => s.tasks);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  // Anchor lets the user roll the window backward by full months. We don't
  // expose arbitrary date pickers — that would muddle the "rolling" framing.
  const [monthsBack, setMonthsBack] = useState(0);

  const anchor = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    d.setMonth(d.getMonth() - monthsBack);
    return d;
  }, [monthsBack]);

  const data = useMemo(
    () =>
      buildYearReview({
        anchor,
        transactions,
        budgetCategories,
        courses,
        sessions,
        workouts,
        tasks,
        holdings,
        manualAssets,
      }),
    [anchor, transactions, budgetCategories, courses, sessions, workouts, tasks, holdings, manualAssets],
  );

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: baseCurrency,
      maximumFractionDigits: 0,
    }).format(n);

  const topCategoryNames = data.finance.topCategories.map((c) => ({
    name: budgetCategories.find((cat) => cat.id === c.categoryId)?.name ?? '—',
    total: c.total,
  }));

  return (
    <>
      <AppHeader title="Year in Review" back="/review" backLabel="Weekly" showAvatar={false} />
      <div className="space-y-3">
        {/* Anchor stepper */}
        <div className="card flex items-center justify-between">
          <button
            onClick={() => setMonthsBack((m) => m + 1)}
            className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
          >
            ← 1 month
          </button>
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-[0.2em] text-text-muted">Trailing 12 months</div>
            <div className="font-heading font-semibold text-sm">
              {formatDateRange(data.rangeStart, data.rangeEnd)}
            </div>
          </div>
          <button
            onClick={() => setMonthsBack((m) => Math.max(0, m - 1))}
            disabled={monthsBack <= 0}
            className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary disabled:opacity-30"
          >
            1 month →
          </button>
        </div>

        {/* Highlights */}
        <div className="card">
          <div className="font-heading font-semibold text-sm mb-2">Highlights</div>
          <div className="space-y-1.5">
            {data.highlights.map((h, i) => (
              <div
                key={i}
                className={`text-xs px-2 py-1.5 rounded-sm border ${TONE_STYLES[h.tone]}`}
              >
                {h.text}
              </div>
            ))}
          </div>
        </div>

        {/* Finance */}
        <button
          onClick={() => navigate('/finance')}
          className="card text-left w-full active:bg-surface2/40"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-semibold text-sm">💰 Finance</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Stat label="Spend" value={fmtMoney(data.finance.totalSpend)} />
            <Stat label="Income" value={fmtMoney(data.finance.totalIncome)} />
            <Stat label="Tx" value={String(data.finance.txCount)} />
          </div>
          {data.finance.spendByDay.size > 0 && (
            <HeatmapCalendar
              data={data.finance.spendByDay}
              tint="warning"
              unit={baseCurrency === 'EUR' ? '€' : baseCurrency}
            />
          )}
          {topCategoryNames.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Top categories</div>
              {topCategoryNames.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="truncate">{c.name}</span>
                  <span className="text-text-muted whitespace-nowrap ml-2">{fmtMoney(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </button>

        {/* Studies — read-only summary (the dedicated screen was removed in
            the v1.3 scope reduction; this stays as a signal recap). */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-semibold text-sm">📚 Studies</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Stat
              label="Studied"
              value={`${Math.round(data.studies.totalStudyMinutes / 60)}h`}
            />
            <Stat label="Sessions" value={String(data.studies.sessionCount)} />
            <Stat label="Courses" value={String(data.studies.coursesAdded)} />
          </div>
          {data.studies.studyMinutesByDay.size > 0 && (
            <HeatmapCalendar
              data={data.studies.studyMinutesByDay}
              tint="primary"
              unit="min"
            />
          )}
          {data.studies.coursesAdded > 0 && (
            <div className="text-[10px] text-text-muted mt-2">
              {data.studies.coursesAdded} courses added during this window.
            </div>
          )}
        </div>

        {/* Fitness — read-only summary (the dedicated screen was removed in
            the v1.3 scope reduction; this stays as a signal recap). */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-semibold text-sm">🏋️ Fitness</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Stat label="Workouts" value={String(data.fitness.workoutCount)} />
            <Stat label="Sets" value={String(data.fitness.totalSets)} />
            <Stat
              label="Volume"
              value={
                data.fitness.totalVolumeKg > 0
                  ? `${Math.round(data.fitness.totalVolumeKg / 1000)}t`
                  : '—'
              }
            />
          </div>
          {data.fitness.workoutsByDay.size > 0 && (
            <HeatmapCalendar data={data.fitness.workoutsByDay} tint="success" unit="workout" />
          )}
          {data.fitness.topExercises.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Most trained</div>
              {data.fitness.topExercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="truncate">{ex.exercise}</span>
                  <span className="text-text-muted whitespace-nowrap ml-2">{ex.sets} sets</span>
                </div>
              ))}
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
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Stat label="Completed" value={String(data.tasks.completed)} />
            <Stat label="Created" value={String(data.tasks.created)} />
          </div>
          {data.tasks.completedByDay.size > 0 && (
            <HeatmapCalendar data={data.tasks.completedByDay} tint="primary" unit="task" />
          )}
        </button>

        <div className="card text-center text-[10px] text-text-muted">
          This is a <span className="text-text">rolling</span> 12-month window —
          step the anchor back month-by-month to see any 12-month slice of your history.
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface2/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="font-heading font-bold text-base truncate">{value}</div>
    </div>
  );
}
