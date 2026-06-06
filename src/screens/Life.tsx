// ─── v1.2 Life patterns full screen ─────────────────────────────────────
//
// Three sections:
//   1. THIS WEEK — big life-score ring + composite number, with the four
//      sub-scores (workouts / study / habits / budget) as a small grid.
//   2. PATTERNS — all observations from buildCrossDomainReport as cards,
//      one per row.
//   3. HISTORY — horizontal scroll of the last 8 weeks' life scores as
//      small chips, oldest left.
//
// Empty/baseline state when <4 weeks of data: shows just the section
// header + "Building your baseline" copy + a calendar tally of how many
// weeks of data exist so far.

import { useMemo } from 'react';
import AppHeader from '../components/AppHeader';
import LifeScoreRing from '../components/LifeScoreRing';
import { useFinanceStore } from '../store/useFinanceStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { buildCrossDomainReport, type Insight } from '../lib/crossDomainSignals';

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

const DOMAIN_LABEL: Record<Insight['domain'], string> = {
  'fitness-study': 'Fitness × Studies',
  'fitness-finance': 'Fitness × Finance',
  'habits-output': 'Habits × Output',
  'life-score': 'Life score',
};

export default function Life() {
  const txns = useFinanceStore((s) => s.transactions);
  const budgets = useFinanceStore((s) => s.budgetCategories);
  const workouts = useFitnessStore((s) => s.sessions);
  const studies = useStudiesStore((s) => s.studySessions);
  const habits = useHabitsStore((s) => s.habits);
  const completions = useHabitsStore((s) => s.completions);

  const report = useMemo(
    () =>
      buildCrossDomainReport(workouts, studies, txns, budgets, habits, completions),
    [workouts, studies, txns, budgets, habits, completions],
  );

  const thisWeek = report.weeks.lifeScores[0];

  return (
    <>
      <AppHeader title="Life Patterns" back="/" backLabel="Home" showAvatar={false} />
      <div className="space-y-6">
        {/* ─── THIS WEEK ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted px-1">
            This week
          </h2>
          {!report.ready ? (
            <div className="glass rounded-xl p-6 text-center">
              <div className="font-heading text-base font-semibold mb-1">
                Building your baseline
              </div>
              <div className="text-xs text-text-muted">
                Insights appear once you've got about 4 weeks of activity logged
                across the suite.
              </div>
            </div>
          ) : (
            <div className="glass rounded-xl p-4 flex flex-col items-center">
              <LifeScoreRing
                workouts={thisWeek.workouts}
                study={thisWeek.study}
                habits={thisWeek.habits}
                budget={thisWeek.budget}
                size={200}
              >
                <div className="flex flex-col items-center leading-none">
                  <span className="font-heading text-5xl font-bold">
                    {thisWeek.score}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted mt-1">
                    Life score
                  </span>
                </div>
              </LifeScoreRing>
              <div className="grid grid-cols-4 gap-2 w-full mt-4">
                <SubScore label="Workouts" score={thisWeek.workouts} dot="bg-primary" />
                <SubScore label="Study"    score={thisWeek.study}    dot="bg-[#A78BFA]" />
                <SubScore label="Habits"   score={thisWeek.habits}   dot="bg-success" />
                <SubScore label="Budget"   score={thisWeek.budget}   dot="bg-warning" />
              </div>
            </div>
          )}
        </section>

        {/* ─── PATTERNS ─────────────────────────────────────────────── */}
        {report.ready && (
          <section className="space-y-2">
            <h2 className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted px-1">
              Patterns
            </h2>
            {report.insights.length === 0 ? (
              <div className="glass-soft rounded-xl p-4 text-center text-xs text-text-muted">
                Nothing crosses the noise floor this week. Keep logging — strong
                patterns become more obvious over time.
              </div>
            ) : (
              <div className="space-y-2 stagger-children">
                {report.insights.map((ins) => (
                  <article
                    key={ins.id}
                    className={`glass rounded-xl p-4 border-l-2 ${TONE_BORDER[ins.tone]}`}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
                      {DOMAIN_LABEL[ins.domain]}
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
              History
            </h2>
            <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 stagger-children">
              {/* Oldest left — reverse the array (it's most-recent first). */}
              {[...report.weeks.lifeScores].reverse().map((w) => (
                <div
                  key={w.weekStart}
                  className="glass-soft rounded-xl p-3 flex-shrink-0 w-20 flex flex-col items-center"
                >
                  <div className="text-[9px] uppercase tracking-wider text-text-muted">
                    {w.weekStart.slice(5)}
                  </div>
                  <div className="font-heading text-xl font-bold mt-1">{w.score}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">/ 100</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="text-[10px] text-text-muted text-center">
          Insights derived from your logged activity — never causal claims.
        </div>
      </div>
    </>
  );
}

function SubScore({ label, score, dot }: { label: string; score: number; dot: string }) {
  return (
    <div className="flex flex-col items-center">
      <span aria-hidden className={`w-2 h-2 rounded-full ${dot} mb-1`} />
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="font-heading text-lg font-bold">{score}</div>
    </div>
  );
}
