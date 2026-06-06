// ─── v1.2 Cross-Domain Insights dashboard card ──────────────────────────
//
// Lightweight summary card for the Dashboard. Renders either:
//   - "Building your baseline" state when <4 weeks of data
//   - A rotating insight (one at a time, cycles every 6s)
//   - "Patterns are quiet this week" copy when ready but no insights cross
//     the 15% delta threshold
//
// Tap → /life for the full screen.
//
// Rotation: useEffect with setInterval, advancing through the available
// insights. We pause rotation while the user is interacting (touch/focus)
// — the natural readability hesitation should pause the card so the user
// can finish reading.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinanceStore } from '../store/useFinanceStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { buildCrossDomainReport, type Insight } from '../lib/crossDomainSignals';

const ROTATE_MS = 6000;

const TONE_TINT: Record<Insight['tone'], string> = {
  positive: 'text-success',
  negative: 'text-warning',
  neutral: 'text-primary',
};

const TONE_GLYPH: Record<Insight['tone'], string> = {
  positive: '↑',
  negative: '↓',
  neutral: '◌',
};

export default function CrossDomainCard() {
  const navigate = useNavigate();
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

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (report.insights.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % report.insights.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, report.insights.length]);

  // Snap idx back in range if the insight set shrinks (e.g. data changes).
  useEffect(() => {
    if (idx >= report.insights.length && report.insights.length > 0) setIdx(0);
  }, [idx, report.insights.length]);

  // Baseline-building state — <4 weeks of activity.
  if (!report.ready) {
    return (
      <button
        type="button"
        onClick={() => navigate('/life')}
        className="glass rounded-xl p-4 text-left w-full press-spring"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-heading font-semibold text-sm">Life patterns</h2>
          <span className="text-[10px] text-text-muted uppercase tracking-wider">
            Building baseline
          </span>
        </div>
        <p className="text-[11px] text-text-muted">
          Cross-domain insights surface after about 4 weeks of data. Keep
          logging — patterns will appear here when there's enough to see.
        </p>
      </button>
    );
  }

  // Ready but no insights pass the 15% threshold — patterns quiet.
  if (report.insights.length === 0) {
    return (
      <button
        type="button"
        onClick={() => navigate('/life')}
        className="glass rounded-xl p-4 text-left w-full press-spring"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-heading font-semibold text-sm">Life patterns</h2>
          <span className="text-[10px] text-text-muted uppercase tracking-wider">
            Quiet week
          </span>
        </div>
        <p className="text-[11px] text-text-muted">
          No standout patterns this week. Tap for your weekly life score
          breakdown.
        </p>
      </button>
    );
  }

  const insight = report.insights[idx] ?? report.insights[0];
  return (
    <button
      type="button"
      onClick={() => navigate('/life')}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="glass rounded-xl p-4 text-left w-full press-spring"
      aria-label="Open life patterns"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading font-semibold text-sm">Life patterns</h2>
        {report.insights.length > 1 && (
          <div className="flex gap-1" aria-hidden>
            {report.insights.map((_, i) => (
              <span
                key={i}
                className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                  i === idx ? 'bg-primary' : 'bg-text-muted/30'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      <div
        key={insight.id}
        className="animate-fade-in-up"
      >
        <div className={`text-2xl ${TONE_TINT[insight.tone]} font-heading font-bold leading-tight mb-1`}>
          <span aria-hidden className="mr-1">{TONE_GLYPH[insight.tone]}</span>
          {insight.headline}
        </div>
        <div className="text-[11px] text-text-muted">{insight.detail}</div>
      </div>
    </button>
  );
}
