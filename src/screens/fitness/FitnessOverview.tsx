import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import StatCard from '../../components/StatCard';
import ListRow from '../../components/ListRow';
import HeatmapCalendar from '../../components/HeatmapCalendar';
import { useFitnessStore } from '../../store/useFitnessStore';
import { localDateKey } from '../../utils/formatters';

const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function FitnessOverview() {
  const navigate = useNavigate();
  const todaySteps = useFitnessStore((s) => s.todaySteps);
  const latestWeight = useFitnessStore((s) => s.latestWeight);
  const weeklySteps = useFitnessStore((s) => s.weeklySteps);
  const sessions = useFitnessStore((s) => s.sessions);
  const stepGoal = useFitnessStore((s) => s.stepGoal);
  const source = useFitnessStore((s) => s.source);
  const hcAvailable = useFitnessStore((s) => s.hcAvailable);
  const hcReason = useFitnessStore((s) => s.hcReason);
  const lastSync = useFitnessStore((s) => s.lastSync);
  const syncing = useFitnessStore((s) => s.syncing);

  const connect = useFitnessStore((s) => s.connectHealthConnect);
  const sync = useFitnessStore((s) => s.syncHealthData);
  const disconnect = useFitnessStore((s) => s.disconnectHealthConnect);
  const setManualSteps = useFitnessStore((s) => s.setManualSteps);
  const setManualWeight = useFitnessStore((s) => s.setManualWeight);
  const setStepGoal = useFitnessStore((s) => s.setStepGoal);
  const load = useFitnessStore((s) => s.load);

  useEffect(() => {
    load();
  }, []);

  const [editingManual, setEditingManual] = useState(false);
  const [stepsDraft, setStepsDraft] = useState('');
  const [weightDraft, setWeightDraft] = useState('');
  const [goalDraft, setGoalDraft] = useState('');
  const [connectMsg, setConnectMsg] = useState<string | null>(null);

  // Heatmap: workouts-per-day. Count, not volume — a 2-hour leg day and
  // a 30-min upper both light up at level 1. Multiple sessions in one day
  // (rare but possible for a split) push the level higher.
  const workoutsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const key = localDateKey(new Date(s.date));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sessions]);

  const last = sessions[0];
  // Scale the chart relative to the step goal as a baseline, falling back
  // to the largest observed value when the user is hitting the goal. This
  // stops a 100-step morning from rendering at 100% and looking like a
  // full day; instead it shows as the small fraction it actually is.
  // Goal floor: 50% of stepGoal so even modest progress is visible.
  const max = Math.max(...weeklySteps, stepGoal * 0.5, 1);
  const stepsTodayDisplay = todaySteps ?? 0;
  const todayIdx = (new Date().getDay() + 6) % 7; // Mon-indexed
  const goalPct = stepGoal > 0 ? Math.round((stepsTodayDisplay / stepGoal) * 100) : 0;

  const onConnect = async () => {
    setConnectMsg('Requesting permissions…');
    const result = await connect();
    if (result.ok) {
      setConnectMsg(null);
    } else {
      setConnectMsg(result.reason ?? 'Failed to connect.');
    }
  };

  const onSaveManual = async () => {
    if (stepsDraft) await setManualSteps(parseInt(stepsDraft));
    if (weightDraft) await setManualWeight(parseFloat(weightDraft));
    if (goalDraft) await setStepGoal(parseInt(goalDraft));
    setStepsDraft('');
    setWeightDraft('');
    setGoalDraft('');
    setEditingManual(false);
  };

  return (
    <>
      <AppHeader
        title="Fitness"
        action={
          <button
            onClick={() => navigate('/fitness/log')}
            className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
          >
            + Log
          </button>
        }
      />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            value={stepsTodayDisplay.toLocaleString()}
            label="Steps"
            sub={
              stepGoal > 0
                ? `${Math.round((stepsTodayDisplay / stepGoal) * 100)}% of goal`
                : undefined
            }
            highlight
          />
          <StatCard
            value={latestWeight != null ? `${latestWeight} kg` : '—'}
            label="Weight"
            sub={source === 'health-connect' ? 'Health Connect' : 'Manual'}
            tone="default"
          />
        </div>

        {source === 'manual' ? (
          <div className="card space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-heading font-semibold text-sm">Health data source</div>
                <div className="text-[10px] text-text-muted">
                  {hcAvailable
                    ? 'Pull steps + weight from Samsung Health via Health Connect'
                    : hcReason || 'Health Connect not available'}
                </div>
              </div>
              <button
                onClick={onConnect}
                disabled={!hcAvailable}
                className="text-xs px-3 py-1.5 rounded-sm border border-primary text-primary disabled:opacity-50 active:bg-primary/10 flex-shrink-0"
              >
                Connect
              </button>
            </div>
            {connectMsg && (
              <div className="text-[10px] text-warning">{connectMsg}</div>
            )}
            {!hcAvailable && (
              <div className="text-[10px] text-text-muted">
                Samsung phones: install Health Connect from Play Store, then in Samsung Health → Settings → Health Connect → enable Steps + Weight permissions.
              </div>
            )}
            <button
              className="btn-ghost w-full text-xs"
              onClick={() => setEditingManual(!editingManual)}
            >
              {editingManual ? 'Hide manual entry' : 'Enter manually instead'}
            </button>
            {editingManual && (
              <div className="space-y-2 pt-1">
                <input
                  className="input"
                  placeholder={`Today's steps (was ${todaySteps ?? 0})`}
                  inputMode="numeric"
                  value={stepsDraft}
                  onChange={(e) => setStepsDraft(e.target.value)}
                />
                <input
                  className="input"
                  placeholder={`Weight kg (was ${latestWeight ?? '—'})`}
                  inputMode="decimal"
                  value={weightDraft}
                  onChange={(e) => setWeightDraft(e.target.value)}
                />
                <input
                  className="input"
                  placeholder={`Daily step goal (was ${stepGoal})`}
                  inputMode="numeric"
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                />
                <button className="btn w-full" onClick={onSaveManual}>
                  Save
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="card flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-heading font-semibold text-sm flex items-center gap-2">
                Health Connect
                <span className="text-[9px] font-heading uppercase tracking-wider text-success border border-success/40 bg-success/5 rounded-sm px-1.5 py-0.5">
                  Connected
                </span>
              </div>
              <div className="text-[10px] text-text-muted">
                {lastSync
                  ? `Last sync ${new Date(lastSync).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Never synced'}
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={sync}
                disabled={syncing}
                className="text-xs px-2 py-1 rounded-sm border border-primary/40 text-primary disabled:opacity-50"
              >
                {syncing ? '…' : '↻ Sync'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Disconnect Health Connect? You can reconnect later.')) {
                    disconnect();
                  }
                }}
                className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted"
              >
                ⨯
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-heading font-semibold text-sm">Weekly Steps</span>
            <span className="text-[9px] uppercase tracking-wider text-text-muted border border-border rounded-sm px-1.5 py-0.5">
              {source === 'health-connect' ? 'Health Connect' : 'Manual'}
            </span>
          </div>
          {/* Chart fixes:
            * 1. Zero-value days render no bar (and no tiny isToday sliver) —
            *    we use the day-label as the placeholder. Stops the "1px
            *    block on the current day" effect when HC hasn't reported.
            * 2. Each non-zero bar has a numeric label above it so values
            *    are legible regardless of bar height.
            * 3. Non-zero bars have an 8% floor so a 100-step day is
            *    actually visible, not a 4% sliver.
            * 4. Today's bar is highlighted only when today actually has
            *    steps; an empty today gets neutral treatment.
            * 5. Footer always shows the real numbers so user trusts the
            *    chart even when it's mostly empty. */}
          <div className="flex items-end gap-1.5 h-28 pt-4">
            {weeklySteps.map((v, i) => {
              const isToday = i === todayIdx;
              const hasValue = v > 0;
              const rawPct = hasValue ? (v / max) * 100 : 0;
              const barHeight = hasValue ? Math.max(8, Math.min(100, rawPct)) : 0;
              const barTone = !hasValue
                ? ''
                : isToday
                  ? 'bg-primary shadow-glow'
                  : v >= stepGoal * 0.7
                    ? 'bg-primary/60'
                    : 'bg-primary/30';
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                >
                  {/* Value label — fixed height so all columns align even
                    * when some have no number. */}
                  <div className="h-3 text-[9px] leading-none text-text-muted font-medium">
                    {hasValue ? formatStepLabel(v) : ''}
                  </div>
                  <div className="w-full flex-1 flex items-end mt-1">
                    {hasValue && (
                      <div
                        className={`w-full rounded-sm ${barTone}`}
                        style={{ height: `${barHeight}%` }}
                      />
                    )}
                  </div>
                  <div
                    className={`text-[10px] mt-1 ${
                      isToday ? 'text-primary font-semibold' : 'text-text-muted'
                    }`}
                  >
                    {dayLabels[i]}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Always-visible footer: shows today's count + progress against
            * goal in plain text. The chart alone can mislead when there's
            * little data; this gives the user the actual numbers. */}
          <div className="flex items-center justify-between text-[11px] text-text-muted mt-2 pt-2 border-t border-border/40">
            <span>
              Today:{' '}
              <span className="text-text font-medium">
                {stepsTodayDisplay.toLocaleString()}
              </span>
              {stepGoal > 0 && (
                <>
                  {' / '}
                  {stepGoal.toLocaleString()} ({goalPct}%)
                </>
              )}
            </span>
            <span className="text-[10px] uppercase tracking-wider">
              {source === 'health-connect' ? 'Live · HC' : 'Manual'}
            </span>
          </div>

          {weeklySteps.filter((v) => v > 0).length < 3 && (
            <div className="text-[10px] text-text-muted/80 text-center mt-2">
              {source === 'health-connect'
                ? 'Past days fill in as you keep the app open — Samsung Health doesn’t backfill history into Health Connect.'
                : 'Past days fill in as you log entries — manual mode tracks only what you record.'}
            </div>
          )}
        </div>

        {sessions.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="font-heading font-semibold text-sm">Workout Streak</span>
              <span className="text-[9px] uppercase tracking-wider text-text-muted">365 days</span>
            </div>
            <HeatmapCalendar data={workoutsByDay} tint="success" unit="workout" />
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-heading font-semibold text-sm">
              {last ? `Last Workout · ${capitalize(last.sessionType)}` : 'No workouts yet'}
            </span>
            {last && (
              <span className="text-[9px] uppercase tracking-wider text-text-muted border border-border rounded-sm px-1.5 py-0.5">
                {relativeDay(last.date)}
              </span>
            )}
          </div>
          {last ? (
            <div className="space-y-1">
              {summarizeSets(last.sets).slice(0, 6).map((row, i) => (
                <ListRow key={i} label={row.exercise} value={row.summary} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-text-muted text-center py-3">
              Tap + Log to start a workout
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Compact step count for chart labels — "850" stays as-is, "12500" → "12.5k",
 *  "8000" → "8k". Keeps the 9px font readable without truncation across all
 *  7 columns. */
function formatStepLabel(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function relativeDay(date: string) {
  const d = new Date(date);
  const today = new Date();
  const days = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function summarizeSets(sets: { exercise: string; weightKg?: number; reps?: number }[]) {
  const groups = new Map<string, { count: number; weights: Set<number>; reps: Set<number> }>();
  for (const s of sets) {
    const g = groups.get(s.exercise) ?? { count: 0, weights: new Set(), reps: new Set() };
    g.count++;
    if (s.weightKg != null) g.weights.add(s.weightKg);
    if (s.reps != null) g.reps.add(s.reps);
    groups.set(s.exercise, g);
  }
  return Array.from(groups.entries()).map(([exercise, g]) => {
    const w = g.weights.size === 1 ? `${[...g.weights][0]} kg` : g.weights.size > 1 ? 'BW/Var' : 'BW';
    const r = g.reps.size === 1 ? [...g.reps][0] : g.reps.size > 1 ? `${Math.min(...g.reps)}–${Math.max(...g.reps)}` : '';
    return { exercise, summary: `${g.count}×${r} @ ${w}` };
  });
}
