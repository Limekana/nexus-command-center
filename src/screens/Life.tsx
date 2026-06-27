// ─── v1.2 Life patterns full screen (v1.5 profile-aware) ────────────────
//
// Three sections:
//   1. THIS WEEK — big life-score ring + composite number, with one sub-score
//      card PER enabled domain of the active Life Profile (v1.5). The ring's
//      segments are sized to each domain's weight.
//   2. PATTERNS — all observations from buildCrossDomainReport as cards.
//   3. HISTORY — horizontal scroll of the last 8 weeks' life scores.
//
// Empty/baseline state when <4 weeks of data unchanged.
//
// v1.5 — the Work domain is NCC-native; its score blends the daily
// self-assessment (50%), logging consistency (20%), active-goal progress
// (20%), and work-life habit completion (10%). Only profiles that enable Work
// surface its card.

import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import AppHeader from '../components/AppHeader';
import LifeScoreRing, { type RingSegment } from '../components/LifeScoreRing';
import LifeNarrativeCard from '../components/LifeNarrativeCard';
import { useFinanceStore } from '../store/useFinanceStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { useTaskStore } from '../store/useTaskStore';
import { useGoalsStore } from '../store/useGoalsStore';
import { useWorkQualityStore } from '../store/useWorkQualityStore';
import { useLifeProfileStore } from '../store/useLifeProfileStore';
import {
  buildCrossDomainReport,
  bucketHabitsByWeek,
  lastNWeeks,
  type Insight,
  type LifeScore,
} from '../lib/crossDomainSignals';
import { computeWorkScore, weeklyRatingStats } from '../lib/workScore';
import { computeGoalProgress, type DataSources } from '../lib/goals';
import {
  enabledDomains,
  type DomainKey,
} from '../lib/lifeProfile';
import { PRIMARY, SUCCESS, WARNING, VIOLET, WORK_PINK } from '../lib/themeColors';

const TONE_BORDER: Record<Insight['tone'], string> = {
  positive: 'border-success/40',
  negative: 'border-warning/40',
  neutral: 'border-primary/40',
};
const TONE_TEXT: Record<Insight['tone'], string> = {
  positive: 'text-success',
  negative: 'text-warning',
  neutral: 'text-primary',
};
const TONE_GLYPH: Record<Insight['tone'], string> = {
  positive: '↑',
  negative: '↓',
  neutral: '◌',
};
const DOMAIN_LABEL_KEY: Record<Insight['domain'], string> = {
  'fitness-study': 'life.xFitnessStudy',
  'fitness-finance': 'life.xFitnessFinance',
  'habits-output': 'life.xHabitsOutput',
  'life-score': 'life.lifeScoreLabel',
};

// Per-domain ring/card accent + which LifeScore field holds its sub-score.
const DOMAIN_COLOR: Record<DomainKey, string> = {
  finance: WARNING,
  fitness: PRIMARY,
  studies: VIOLET,
  work: WORK_PINK,
  habits: SUCCESS,
};
const DOMAIN_SUBSCORE: Record<DomainKey, keyof Pick<LifeScore, 'workouts' | 'study' | 'habits' | 'budget' | 'work'>> = {
  finance: 'budget',
  fitness: 'workouts',
  studies: 'study',
  work: 'work',
  habits: 'habits',
};

export default function Life() {
  const { t } = useTranslation();
  const txns = useFinanceStore((s) => s.transactions);
  const budgets = useFinanceStore((s) => s.budgetCategories);
  const workouts = useFitnessStore((s) => s.sessions);
  const studies = useStudiesStore((s) => s.studySessions);
  const currentImport = useStudiesStore((s) => s.currentImport);
  const habits = useHabitsStore((s) => s.habits);
  const completions = useHabitsStore((s) => s.completions);
  const tasks = useTaskStore((s) => s.tasks);
  const goals = useGoalsStore((s) => s.goals);
  const workLogs = useWorkQualityStore((s) => s.logs);
  const loadWork = useWorkQualityStore((s) => s.load);
  const workLoaded = useWorkQualityStore((s) => s.loaded);
  const profile = useLifeProfileStore((s) => s.profile);
  const loadProfile = useLifeProfileStore((s) => s.load);

  useEffect(() => {
    if (!workLoaded) void loadWork();
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Work score (only meaningful when the profile enables Work) ─────────
  const workScore = useMemo(() => {
    const { weeklyRatingAvg, daysLoggedThisWeek } = weeklyRatingStats(workLogs);

    // Active-goal progress: average of clamped per-goal % across incomplete
    // goals. DataSources is assembled from the stores that the relevant goal
    // types read; portfolio-valuation fields are left empty (net_worth goals
    // then read 0 — accepted, since Work weights goals only 20%).
    const activeGoals = goals.filter((g) => !g.completed && !g.deletedAt);
    let goalsProgressPct = 0;
    if (activeGoals.length > 0) {
      const ds: DataSources = {
        transactions: txns,
        holdings: [],
        manualAssets: [],
        stockQuotes: [],
        cryptoPrices: null,
        fxRates: null,
        baseCurrency: 'EUR',
        tasks,
        studySessions: studies,
        workouts: workouts as DataSources['workouts'],
        currentGpa: currentImport?.calculatedGpa ?? null,
      };
      const sum = activeGoals.reduce(
        (s, g) => s + Math.min(100, Math.max(0, computeGoalProgress(g, ds).percent)),
        0,
      );
      goalsProgressPct = sum / activeGoals.length;
    }

    // Work-life habit completion: current-week habit hit ratio.
    const habitWeek = bucketHabitsByWeek(habits, completions, lastNWeeks(1))[0];
    const workLifeHabitsPct = habitWeek?.hitRatio != null ? habitWeek.hitRatio * 100 : 0;

    return computeWorkScore({ weeklyRatingAvg, daysLoggedThisWeek, goalsProgressPct, workLifeHabitsPct });
  }, [workLogs, goals, txns, tasks, studies, workouts, currentImport, habits, completions]);

  const report = useMemo(
    () =>
      buildCrossDomainReport(workouts, studies, txns, budgets, habits, completions, 8, new Date(), {
        profile,
        currentWorkScore: workScore,
        workHasData: workLogs.length > 0,
      }),
    [workouts, studies, txns, budgets, habits, completions, profile, workScore, workLogs.length],
  );

  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = historyScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [report.weeks.lifeScores.length]);

  const thisWeek = report.weeks.lifeScores[0];
  const domains = enabledDomains(profile);

  // Ring shows only domains that were measured this week (have data) — matching
  // the composite, which excludes un-engaged domains rather than scoring them 0.
  const ringSegments: RingSegment[] = useMemo(
    () =>
      domains
        .filter((k) => thisWeek?.measured[k])
        .map((k) => ({
          key: k,
          score: thisWeek ? thisWeek[DOMAIN_SUBSCORE[k]] : 0,
          weight: profile.domains[k],
          color: DOMAIN_COLOR[k],
        })),
    [domains, profile, thisWeek],
  );

  // Work card sub-line ("Avg X/5 · Y days").
  const workStats = useMemo(() => weeklyRatingStats(workLogs), [workLogs]);

  return (
    <>
      <AppHeader title={t('life.title')} back="/" backLabel={t('nav.home')} showAvatar={false} />
      <div className="space-y-6">
        {/* ─── THIS WEEK ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted px-1">
            {t('life.thisWeek')}
          </h2>
          {!report.ready ? (
            <div className="glass rounded-xl p-6 text-center">
              <div className="font-heading text-base font-semibold mb-1">{t('life.buildingBaseline')}</div>
              <div className="text-xs text-text-muted">
                {t('life.buildingBaselineSub')}
              </div>
            </div>
          ) : (
            <div className="glass rounded-xl p-4 flex flex-col items-center">
              <LifeScoreRing segments={ringSegments} size={200}>
                <div className="flex flex-col items-center leading-none">
                  <span className="font-heading text-5xl font-bold">{thisWeek.score}</span>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted mt-1">{t('domains.lifeScore')}</span>
                </div>
              </LifeScoreRing>
              <div className="grid grid-cols-2 gap-2 w-full mt-4">
                {domains.map((k) => {
                  const measured = thisWeek.measured[k];
                  return (
                    <DomainCard
                      key={k}
                      domain={k}
                      score={thisWeek[DOMAIN_SUBSCORE[k]]}
                      measured={measured}
                      sub={
                        !measured
                          ? t('life.notCountedYet')
                          : k === 'work'
                            ? workStats.daysLoggedThisWeek > 0
                              ? t('life.avgRating', { avg: workStats.weeklyRatingAvg.toFixed(1), count: workStats.daysLoggedThisWeek, unit: workStats.daysLoggedThisWeek === 1 ? t('life.day') : t('life.days') })
                              : t('life.noRatingsYet')
                            : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* ─── AI NARRATIVE ─────────────────────────────────────────── */}
        {report.ready && thisWeek && (
          <LifeNarrativeCard
            input={{
              lifeScore: thisWeek.score,
              workouts: thisWeek.workouts,
              study: thisWeek.study,
              habits: thisWeek.habits,
              budget: thisWeek.budget,
              work: thisWeek.work,
              profile,
              insightHeadlines: report.insights.map((i) => i.headline),
            }}
          />
        )}

        {/* ─── PATTERNS ─────────────────────────────────────────────── */}
        {report.ready && (
          <section className="space-y-2">
            <h2 className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted px-1">
              {t('life.patterns')}
            </h2>
            {report.insights.length === 0 ? (
              <div className="glass-soft rounded-xl p-4 text-center text-xs text-text-muted">
                {t('life.patternsEmpty')}
              </div>
            ) : (
              <div className="space-y-2 stagger-children">
                {report.insights.map((ins) => (
                  <article key={ins.id} className={`glass rounded-xl p-4 border-l-2 ${TONE_BORDER[ins.tone]}`}>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
                      {t(DOMAIN_LABEL_KEY[ins.domain])}
                    </div>
                    <div className={`font-heading text-base font-bold leading-tight ${TONE_TEXT[ins.tone]} mb-1`}>
                      <span aria-hidden className="mr-1">{TONE_GLYPH[ins.tone]}</span>
                      {ins.headline}
                    </div>
                    <div className="text-xs text-text-muted">{ins.detail}</div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ─── HISTORY ─────────────────────────────────────────────── */}
        {report.ready && (
          <section className="space-y-2">
            <h2 className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted px-1">
              {t('life.history')}
            </h2>
            <div ref={historyScrollRef} className="flex gap-2 overflow-x-auto no-scrollbar px-1 stagger-children">
              {[...report.weeks.lifeScores].reverse().map((w) => (
                <div key={w.weekStart} className="glass-soft rounded-xl p-3 flex-shrink-0 w-20 flex flex-col items-center">
                  <div className="text-[9px] uppercase tracking-wider text-text-muted">{w.weekStart.slice(5)}</div>
                  <div className="font-heading text-xl font-bold mt-1">{w.score}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">{t('life.per100')}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="text-[10px] text-text-muted text-center">
          {t('life.footer')}
        </div>
      </div>
    </>
  );
}

function DomainCard({ domain, score, sub, measured = true }: { domain: DomainKey; score: number; sub?: string; measured?: boolean }) {
  const { t } = useTranslation();
  const isWork = domain === 'work';
  return (
    <div
      className={`rounded-xl p-3 border ${
        !measured
          ? 'border-glass-border bg-white/[0.01] opacity-60'
          : isWork
            ? 'border-[#F778BA]/30 bg-[#F778BA]/[0.06]'
            : 'border-glass-border bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: measured ? DOMAIN_COLOR[domain] : 'rgba(168,178,188,0.4)' }} />
        <div className="text-[10px] uppercase tracking-wider text-text-muted">{t(`domains.${domain}`)}</div>
      </div>
      <div className="font-heading text-xl font-bold mt-0.5">{measured ? score : '—'}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
