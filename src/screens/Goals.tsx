// Goals screen. Lists active + completed goals, each with live progress
// computed from every relevant module's current state. Tap an active goal
// to expand actions (mark complete / edit / delete). Tap + Goal to add.
//
// Progress is derived live (see `lib/goals.ts`) — no cached "currentValue"
// on the row, so editing a workout / undoing a task / refreshing the
// portfolio immediately moves every relevant bar.

import { useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import RowActions from '../components/RowActions';
import { useGoalsStore } from '../store/useGoalsStore';
import { useFinanceStore } from '../store/useFinanceStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useTaskStore } from '../store/useTaskStore';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  computeGoalProgress,
  paceLabel,
  formatGoalValue,
  defaultTargetValue,
  type DataSources,
} from '../lib/goals';
import {
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
  isCumulativeGoal,
  type Goal,
  type GoalType,
} from '../types/goals';

export default function Goals() {
  const goals = useGoalsStore((s) => s.goals);
  const addGoal = useGoalsStore((s) => s.addGoal);
  const updateGoal = useGoalsStore((s) => s.updateGoal);
  const markCompleted = useGoalsStore((s) => s.markCompleted);
  const deleteGoal = useGoalsStore((s) => s.deleteGoal);

  // Pull live data from every relevant module so progress refreshes
  // automatically when any underlying source changes.
  const holdings = useFinanceStore((s) => s.holdings);
  const stockQuotes = useFinanceStore((s) => s.stockQuotes);
  const cryptoPrices = useFinanceStore((s) => s.cryptoPrices);
  const fxRates = useFinanceStore((s) => s.fxRates);
  const manualAssets = useFinanceStore((s) => s.manualAssets);
  const transactions = useFinanceStore((s) => s.transactions);
  const tasks = useTaskStore((s) => s.tasks);
  const studySessions = useStudiesStore((s) => s.studySessions);
  const readings = useStudiesStore((s) => s.readings);
  const currentImport = useStudiesStore((s) => s.currentImport);
  const workouts = useFitnessStore((s) => s.sessions);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  const dataSources: DataSources = useMemo(
    () => ({
      transactions,
      holdings,
      manualAssets,
      stockQuotes,
      cryptoPrices,
      fxRates,
      baseCurrency,
      tasks,
      studySessions,
      readings,
      workouts,
      currentGpa: currentImport?.calculatedGpa ?? null,
    }),
    [
      transactions,
      holdings,
      manualAssets,
      stockQuotes,
      cryptoPrices,
      fxRates,
      baseCurrency,
      tasks,
      studySessions,
      readings,
      workouts,
      currentImport,
    ],
  );

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const active = goals.filter((g) => !g.completed);
  const completed = goals.filter((g) => g.completed);

  const editingNow = adding || editing != null;

  return (
    <>
      <AppHeader
        title="Goals"
        back="/"
        backLabel="Home"
        showAvatar={false}
        action={
          !editingNow && (
            <button
              onClick={() => setAdding(true)}
              className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
            >
              + Goal
            </button>
          )
        }
      />
      <div className="space-y-3">
        {editingNow && (
          <GoalForm
            initial={editing}
            baseCurrency={baseCurrency}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
            }}
            onSave={async (g) => {
              if (editing) {
                await updateGoal(editing.id, g);
              } else {
                await addGoal(g);
              }
              setAdding(false);
              setEditing(null);
            }}
          />
        )}

        {goals.length === 0 && !editingNow && (
          <div className="card text-center text-xs text-text-muted py-6">
            No goals yet. Tap + Goal to set one.
            <div className="text-[10px] mt-2">
              Goals are derived from data you already track — net worth,
              tasks, workouts, books, study hours, lifts, GPA.
            </div>
          </div>
        )}

        {active.length > 0 && !editingNow && (
          <div className="card space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Active</div>
            {active.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                data={dataSources}
                baseCurrency={baseCurrency}
                onEdit={() => setEditing(g)}
                onComplete={() => markCompleted(g.id, true)}
                onDelete={() => deleteGoal(g.id)}
              />
            ))}
          </div>
        )}

        {completed.length > 0 && !editingNow && (
          <div className="card space-y-3 opacity-80">
            <div className="text-[10px] uppercase tracking-wider text-success">Completed</div>
            {completed.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                data={dataSources}
                baseCurrency={baseCurrency}
                onEdit={() => setEditing(g)}
                onComplete={() => markCompleted(g.id, false)}
                onDelete={() => deleteGoal(g.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Goal row
// ───────────────────────────────────────────────────────────────────────────

function GoalRow({
  goal,
  data,
  baseCurrency,
  onEdit,
  onComplete,
  onDelete,
}: {
  goal: Goal;
  data: DataSources;
  baseCurrency: string;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const progress = useMemo(() => computeGoalProgress(goal, data), [goal, data]);
  const meta = GOAL_TYPE_LABELS[goal.goalType];
  const pace = paceLabel(goal, progress);
  const pct = Math.min(100, Math.max(0, progress.percent));

  // Bar tone: success when reached / on pace, warning when behind by >10%,
  // primary otherwise. Pure cosmetic — the number is the source of truth.
  const tone: 'success' | 'warning' | 'primary' = (() => {
    if (progress.reached) return 'success';
    if (pace?.startsWith('behind')) return 'warning';
    return 'primary';
  })();

  const barColor = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-primary';

  return (
    <div className="py-2 border-b border-border/40 last:border-0">
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-heading font-semibold text-sm truncate">{goal.title}</div>
            <RowActions
              onEdit={onEdit}
              onDelete={onDelete}
              confirmMsg={`Delete "${goal.title}"?`}
            />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-text-muted whitespace-nowrap">
              {Math.round(progress.percent)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-muted mt-1">
            <span>
              {formatGoalValue(goal, progress.currentValue, baseCurrency)}
              {' / '}
              {formatGoalValue(goal, goal.targetValue, baseCurrency)}
            </span>
            <span>
              {progress.daysRemaining != null
                ? `${progress.daysRemaining}d left${pace ? ` · ${pace}` : ''}`
                : 'no deadline'}
            </span>
          </div>
          {progress.reached && !goal.completed && (
            <button
              onClick={onComplete}
              className="text-[10px] mt-2 px-2 py-1 rounded-sm border border-success/40 bg-success/5 text-success active:bg-success/10"
            >
              ✓ Mark complete
            </button>
          )}
          {goal.completed && (
            <button
              onClick={onComplete}
              className="text-[10px] mt-2 px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary"
            >
              ↩ Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Goal create/edit form
// ───────────────────────────────────────────────────────────────────────────

function GoalForm({
  initial,
  baseCurrency,
  onCancel,
  onSave,
}: {
  initial: Goal | null;
  baseCurrency: string;
  onCancel: () => void;
  onSave: (g: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'completed' | 'completedAt' | 'deletedAt'>) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [goalType, setGoalType] = useState<GoalType>(initial?.goalType ?? 'workout_count');
  const [targetValue, setTargetValue] = useState<string>(
    initial ? String(initial.targetValue) : String(defaultTargetValue('workout_count')),
  );
  const [targetDate, setTargetDate] = useState<string>(initial?.targetDate ?? '');
  const [startDate, setStartDate] = useState<string>(
    initial?.startDate ?? new Date().toISOString().slice(0, 10),
  );
  const [exerciseName, setExerciseName] = useState<string>(initial?.exerciseName ?? '');

  const onPickType = (t: GoalType) => {
    setGoalType(t);
    // Auto-suggest a sensible target when the user picks a new type — only
    // if they haven't typed something custom yet.
    if (!initial || targetValue === String(defaultTargetValue(initial.goalType))) {
      setTargetValue(String(defaultTargetValue(t)));
    }
  };

  const meta = GOAL_TYPE_LABELS[goalType];
  const needsExercise = goalType === 'lift_pr';
  const isCumulative = isCumulativeGoal(goalType);

  const save = async () => {
    const targetNum = parseFloat(targetValue);
    if (!title.trim() || !Number.isFinite(targetNum) || targetNum <= 0) return;
    if (needsExercise && !exerciseName.trim()) return;
    await onSave({
      title: title.trim(),
      goalType,
      targetValue: targetNum,
      targetDate: targetDate || undefined,
      startDate,
      exerciseName: needsExercise ? exerciseName.trim() : undefined,
      currency: goalType === 'net_worth' ? baseCurrency : undefined,
    });
  };

  return (
    <div className="card space-y-3">
      <div className="font-heading font-semibold text-sm">{initial ? 'Edit Goal' : 'New Goal'}</div>

      <input
        className="input"
        placeholder="Goal title (e.g. Read 24 books in 2026)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Type</div>
        <div className="grid grid-cols-3 gap-1.5">
          {GOAL_TYPES.map((t) => {
            const m = GOAL_TYPE_LABELS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => onPickType(t)}
                className={`chip text-[11px] ${goalType === t ? 'chip-on' : ''}`}
              >
                {m.icon} {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
          Target {meta.unit ? `(${meta.unit})` : ''}
        </div>
        <input
          className="input"
          inputMode="decimal"
          placeholder={String(defaultTargetValue(goalType))}
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
        />
      </div>

      {needsExercise && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
            Exercise name
          </div>
          <input
            className="input"
            placeholder="e.g. Bench Press"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            autoCapitalize="words"
          />
          <div className="text-[10px] text-text-muted mt-1">
            Matches case-insensitively against the "exercise" field on your workout sets.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
            Start date
          </div>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          {isCumulative && (
            <div className="text-[9px] text-text-muted mt-1">
              Only events on/after this date count.
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
            Target date {goalType === 'lift_pr' || goalType === 'gpa' ? '(optional)' : ''}
          </div>
          <input
            type="date"
            className="input"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={save}>
          {initial ? 'Save' : 'Add'}
        </button>
        <button className="btn-ghost flex-1" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
