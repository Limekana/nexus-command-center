import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import SyncStatusChip from '../components/SyncStatusChip';
import StatCard from '../components/StatCard';
import ModuleSummaryCard from '../components/ModuleSummaryCard';
import HabitsDashboardStrip from '../components/HabitsDashboardStrip';
import WorkRatingCard from '../components/WorkRatingCard';
import CrossDomainCard from '../components/CrossDomainCard';
import ListRow from '../components/ListRow';
import ProgressBar from '../components/ProgressBar';
import { useFinanceStore } from '../store/useFinanceStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useTaskStore } from '../store/useTaskStore';
import { formatCurrency, isOverdue, isToday } from '../utils/formatters';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const budgetCategories = useFinanceStore((s) => s.budgetCategories);
  const stockQuotes = useFinanceStore((s) => s.stockQuotes);

  const studies = useStudiesStore((s) => s.currentImport);
  const studyCourses = useStudiesStore((s) => s.courses);
  const previousGpa = useStudiesStore((s) => s.previousGpa);
  const gradeMode = useStudiesStore((s) => s.gradeMode);

  const sessions = useFitnessStore((s) => s.sessions);

  const tasks = useTaskStore((s) => s.tasks);

  // Portfolio auto-refresh used to live here, but Dashboard mounts as a child
  // of AppShell — at first-mount the holdings store is still empty (AppShell's
  // load() is in flight), so the refresh saw `holdings: []` and bailed on the
  // empty-portfolio early-return. The net-worth widgets then sat on stale data
  // until the user navigated to /finance/portfolio, which has its own
  // mount-effect refresh that runs *after* holdings are populated.
  //
  // Auto-refresh now lives in AppShell, gated on `holdings.length` so it only
  // fires once holdings are actually loaded. Keep the selector above so the
  // Dashboard can still see live state — but no longer trigger a refresh here.

  const monthExpenses = useMemo(() => {
    const now = new Date();
    return transactions
      .filter((t) => t.type === 'expense' && new Date(t.date).getMonth() === now.getMonth())
      .reduce((s, t) => s + t.amount, 0);
  }, [transactions]);

  const monthBudget = useMemo(
    () => budgetCategories.reduce((s, c) => s + c.monthlyLimit, 0),
    [budgetCategories]
  );
  const budgetPct = monthBudget > 0 ? Math.round((monthExpenses / monthBudget) * 100) : 0;

  const tasksToday = tasks.filter((t) => !t.completed && t.dueDate && isToday(t.dueDate)).length;
  const tasksOverdue = tasks.filter((t) => !t.completed && t.dueDate && isOverdue(t.dueDate)).length;
  const tasksOpen = tasks.filter((t) => !t.completed);

  const workoutsThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return sessions.filter((s) => new Date(s.date).getTime() > weekAgo).length;
  }, [sessions]);

  const gpaDelta = studies && previousGpa != null
    ? `${studies.calculatedGpa - previousGpa >= 0 ? '↑' : '↓'} ${Math.abs(studies.calculatedGpa - previousGpa).toFixed(2)} ${t('dash.pts')}`
    : studies ? t('dash.coursesCount', { count: studyCourses.length }) : t('dash.noImports');

  const gpaSuffix = gradeMode === 'ib' ? '/7' : '';
  const gpaDisplay = studies ? studies.calculatedGpa.toFixed(2) + gpaSuffix : '—';

  return (
    <>
      <AppHeader
        title="NEXUS HQ"
        action={
          <>
            <button
              onClick={() => navigate('/goals')}
              className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
            >
              🎯 {t('dash.goals')}
            </button>
            <button
              onClick={() => navigate('/review')}
              className="text-xs px-2 py-1 rounded-sm border border-primary/60 text-primary active:bg-primary/10"
            >
              📊 {t('dash.review')}
            </button>
          </>
        }
      />
      <div className="space-y-3">
        <SyncStatusChip />

        {/* v1.2 — daily habits surface above the stat grid. The strip itself
            handles all empty/eligible/all-rest-day states; we render it
            unconditionally so the layout doesn't shift based on data. */}
        <HabitsDashboardStrip />

        {/* v1.5 — Work domain daily self-assessment. Self-gates: renders only
            when the active Life Profile includes Work, on weekday afternoons. */}
        <WorkRatingCard />

        {/* v1.2 — Cross-domain life-patterns rotator. Surfaces beneath the
            habits strip; handles its own baseline/quiet/insight states. */}
        <CrossDomainCard />

        <div>
          <div className="sec mb-2">{t('dash.overview')}</div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              value={formatCurrency(Math.max(0, monthBudget - monthExpenses))}
              label={t('dash.budgetLeft')}
              sub={monthBudget > 0 ? t('dash.pctUsed', { pct: budgetPct }) : t('dash.noBudgets')}
              tone={budgetPct > 90 ? 'danger' : budgetPct > 70 ? 'warning' : 'success'}
              highlight
            />
            <StatCard
              value={gpaDisplay}
              label={t('dash.gpa')}
              sub={gpaDelta}
              tone={studies ? 'success' : 'default'}
            />
            <StatCard
              value={`${workoutsThisWeek}×`}
              label={t('dash.workoutsWk')}
              sub={workoutsThisWeek >= 4 ? t('dash.onTarget') : t('dash.pushHarder')}
            />
            <StatCard
              value={tasksToday}
              label={t('dash.tasksToday')}
              sub={tasksOverdue > 0 ? t('dash.overdueWarn', { count: tasksOverdue }) : t('dash.allOnTrack')}
              tone={tasksOverdue > 0 ? 'danger' : 'default'}
            />
          </div>
        </div>

        <div className="sec mb-2">{t('dash.modules')}</div>
        <div className="grid grid-cols-1 gap-2">
          <ModuleSummaryCard title={t('domains.finance')} icon="💰" tag={monthBudget > 0 ? t('dash.tagLive') : t('dash.tagIdle')} to="/finance">
            {monthBudget > 0 ? (
              <ProgressBar
                label={t('dash.budgetUsed')}
                value={monthExpenses}
                max={monthBudget || 1}
                format={(v, m) => `${Math.round((v / m) * 100)}%`}
              />
            ) : (
              <Empty msg={t('dash.noBudgetsYet')} />
            )}
            {stockQuotes[0] ? (
              <ListRow
                label={`${stockQuotes[0].ticker} ${stockQuotes[0].cached ? t('dash.cached') : ''}`}
                value={`$${stockQuotes[0].quote.c.toFixed(2)}`}
              />
            ) : (
              <Empty msg={t('dash.noHoldings')} />
            )}
          </ModuleSummaryCard>

          <ModuleSummaryCard title={t('nav.tasks')} icon="✅" tag={tasksOverdue > 0 ? t('dash.tagOverdue') : tasksOpen.length > 0 ? t('dash.tagOpen') : t('dash.tagClear')} to="/tasks">
            {tasksOpen.length > 0 ? (
              tasksOpen.slice(0, 2).map((task) => (
                <ListRow
                  key={task.id}
                  label={task.title}
                  tag={task.dueDate && isOverdue(task.dueDate) ? { text: t('dash.late'), tone: 'red' } :
                       task.dueDate && isToday(task.dueDate) ? { text: t('dash.today'), tone: 'amber' } : undefined}
                />
              ))
            ) : (
              <>
                <Empty msg={t('dash.allClear')} />
                <Empty msg={t('dash.tapToAdd')} />
              </>
            )}
            {tasksOpen.length === 1 && <Empty msg=" " />}
          </ModuleSummaryCard>
        </div>
      </div>
    </>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-[11px] text-text-muted/70 italic">{msg}</div>;
}
