import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import TemplateChips from '../../components/TemplateChips';
import { useFitnessStore } from '../../store/useFitnessStore';
import { useTemplatesStore } from '../../store/useTemplatesStore';
import type { WorkoutTemplate } from '../../types/templates';

const presetTypes: { key: string; label: string }[] = [
  { key: 'push', label: '🏋 Push' },
  { key: 'pull', label: '🔄 Pull' },
  { key: 'legs', label: '🦵 Legs' },
  { key: 'upper', label: '💪 Upper' },
  { key: 'lower', label: '🦿 Lower' },
  { key: 'fullbody', label: '🏃 Full Body' },
  { key: 'cardio', label: '🤸 Cardio' },
];

const exerciseSuggestions: Record<string, string[]> = {
  push: ['Bench Press', 'Incline DB Press', 'Overhead Press', 'Tricep Extension', 'Lateral Raise', 'Dips', 'Cable Fly'],
  pull: ['Deadlift', 'Barbell Row', 'Pull-ups', 'Bicep Curl', 'Face Pull', 'Lat Pulldown', 'Hammer Curl'],
  legs: ['Squat', 'Romanian Deadlift', 'Leg Press', 'Lunges', 'Calf Raise', 'Leg Curl', 'Leg Extension'],
  upper: ['Bench Press', 'Barbell Row', 'Overhead Press', 'Pull-ups', 'Dips', 'Bicep Curl', 'Tricep Extension'],
  lower: ['Squat', 'Romanian Deadlift', 'Leg Press', 'Lunges', 'Calf Raise', 'Hip Thrust', 'Leg Curl'],
  fullbody: ['Squat', 'Bench Press', 'Deadlift', 'Pull-ups', 'Overhead Press', 'Barbell Row', 'Lunges'],
  cardio: ['Running', 'Cycling', 'Rowing', 'Stair Climber', 'Jump Rope', 'Incline Walk', 'Swimming'],
};

const ALL_EXERCISES = Array.from(
  new Set(Object.values(exerciseSuggestions).flat())
).sort();

export default function LogWorkout() {
  const startOrGet = useFitnessStore((s) => s.startOrGetTodaySession);
  const addSet = useFitnessStore((s) => s.addSet);
  const deleteSet = useFitnessStore((s) => s.deleteSet);
  const deleteSession = useFitnessStore((s) => s.deleteSession);
  const todaySession = useFitnessStore((s) => s.todaySession);
  const load = useFitnessStore((s) => s.load);
  const templates = useTemplatesStore((s) => s.workouts);
  const refreshTemplates = useTemplatesStore((s) => s.refresh);

  const [type, setType] = useState<string>('push');
  const [customType, setCustomType] = useState('');
  const [usingCustom, setUsingCustom] = useState(false);
  const [exercise, setExercise] = useState('Bench Press');
  const [customExercise, setCustomExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    load();
    void refreshTemplates();
  }, []);

  const effectiveType = usingCustom ? customType.trim().toLowerCase() : type;

  useEffect(() => {
    if (todaySession?.sessionType === effectiveType) setSessionId(todaySession.id);
    else setSessionId(null);
  }, [todaySession, effectiveType]);

  const exerciseOptions = useMemo(() => {
    return exerciseSuggestions[effectiveType] ?? ALL_EXERCISES;
  }, [effectiveType]);

  useEffect(() => {
    if (!exerciseOptions.includes(exercise) && exercise !== '__custom') {
      setExercise(exerciseOptions[0] ?? 'Custom');
    }
  }, [exerciseOptions]);

  const ensureSession = async () => {
    if (!effectiveType) return null;
    if (sessionId) return sessionId;
    const id = await startOrGet(effectiveType);
    setSessionId(id);
    return id;
  };

  const applyTemplate = (t: WorkoutTemplate) => {
    // If the exercise is in the current split's suggestion list, pick it
    // directly. Otherwise route through __custom so the input shows the
    // template's exercise name verbatim.
    if (exerciseOptions.includes(t.exercise)) {
      setExercise(t.exercise);
    } else {
      setExercise('__custom');
      setCustomExercise(t.exercise);
    }
    setWeight(t.weightKg != null ? String(t.weightKg) : '');
    setReps(t.reps != null ? String(t.reps) : '');
    // RPE intentionally left blank — it's session-specific perception, not
    // something we'd want to pre-fill from a frequency-based template.
  };

  const submit = async () => {
    const finalExercise = exercise === '__custom' ? customExercise.trim() : exercise;
    if (!finalExercise || !reps || !effectiveType) return;
    const sid = await ensureSession();
    if (!sid) return;
    await addSet(sid, {
      exercise: finalExercise,
      weightKg: weight ? parseFloat(weight) : undefined,
      reps: parseInt(reps),
      rpe: rpe ? parseInt(rpe) : undefined,
    });
    setReps('');
    setRpe('');
  };

  const todaysSets = todaySession?.sets ?? [];
  const setCounts = new Map<string, number>();
  for (const s of todaysSets) setCounts.set(s.exercise, (setCounts.get(s.exercise) ?? 0) + 1);

  const currentLabel = exercise === '__custom' ? customExercise || 'Custom' : exercise;

  return (
    <>
      <AppHeader title="Log Workout" back="/fitness" backLabel="Fitness" showAvatar={false} />
      <div className="space-y-3">
        {templates.length > 0 && (
          <TemplateChips
            templates={templates}
            onPick={applyTemplate}
            label={(t) => (
              <>
                <span className="truncate max-w-[120px]">{t.exercise}</span>
                <span className="opacity-60">·</span>
                <span className="font-medium whitespace-nowrap">
                  {t.weightKg != null ? `${t.weightKg}kg×${t.reps}` : `BW×${t.reps}`}
                </span>
              </>
            )}
          />
        )}
        <div>
          <div className="sec mb-2">Workout Type</div>
          <div className="flex gap-2 flex-wrap">
            {presetTypes.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setUsingCustom(false);
                  setType(t.key);
                }}
                className={`chip ${!usingCustom && type === t.key ? 'chip-on' : ''}`}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => setUsingCustom(true)}
              className={`chip ${usingCustom ? 'chip-on' : ''}`}
            >
              ✏ Custom
            </button>
          </div>
          {usingCustom && (
            <input
              className="input mt-2"
              placeholder="Split name (e.g. arms, conditioning, mobility)"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              autoFocus
            />
          )}
        </div>

        <div>
          <div className="sec mb-2">Exercise</div>
          <select
            className="input"
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
          >
            {exerciseOptions.map((ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            ))}
            <option value="__custom">+ Custom exercise…</option>
          </select>
          {exercise === '__custom' && (
            <input
              className="input mt-2"
              placeholder="Exercise name"
              value={customExercise}
              onChange={(e) => setCustomExercise(e.target.value)}
            />
          )}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-heading font-semibold text-sm">
              {currentLabel} · Set {(setCounts.get(currentLabel) ?? 0) + 1}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="sec mb-1">Weight</div>
              <input
                className="input text-center font-heading font-bold text-xl"
                inputMode="decimal"
                placeholder="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <div className="text-[10px] text-text-muted mt-1">kg</div>
            </div>
            <div className="text-center">
              <div className="sec mb-1">Reps</div>
              <input
                className="input text-center font-heading font-bold text-xl"
                inputMode="numeric"
                placeholder="0"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
              />
              <div className="text-[10px] text-text-muted mt-1">×</div>
            </div>
            <div className="text-center">
              <div className="sec mb-1">RPE</div>
              <input
                className="input text-center font-heading font-bold text-xl"
                inputMode="numeric"
                placeholder="–"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
              />
              <div className="text-[10px] text-text-muted mt-1">/10</div>
            </div>
          </div>
          <button
            className="btn w-full"
            onClick={submit}
            disabled={!effectiveType || !reps}
          >
            + Log Set
          </button>
        </div>

        <div className="card">
          <div className="font-heading font-semibold text-sm mb-2">Today's Sets</div>
          {todaysSets.length === 0 && (
            <div className="text-xs text-text-muted text-center py-3">
              No sets logged today
            </div>
          )}
          {todaysSets.map((s, i) => {
            const exSetNum = todaysSets.slice(0, i + 1).filter((x) => x.exercise === s.exercise).length;
            return (
              <div key={s.id} className="flex items-center gap-2 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                <div className="flex-1 text-sm truncate">{`${s.exercise} · Set ${exSetNum}`}</div>
                <span className="text-sm text-text-muted whitespace-nowrap">
                  {`${s.weightKg ?? 'BW'}${s.weightKg ? 'kg' : ''}×${s.reps}${s.rpe ? ` @${s.rpe}` : ''}`}
                </span>
                <RowActions
                  onDelete={() => deleteSet(s.id)}
                  confirmMsg={`Delete this set of ${s.exercise}?`}
                />
              </div>
            );
          })}
          {todaySession && todaysSets.length > 0 && (
            <button
              className="btn-ghost w-full mt-2 text-danger border-danger/40 text-xs"
              onClick={() => {
                if (confirm('Delete entire workout session?')) deleteSession(todaySession.id);
              }}
            >
              Delete Workout Session
            </button>
          )}
        </div>

        <div className="text-[10px] text-text-muted text-center">
          Queued locally · syncs when online
        </div>
      </div>
    </>
  );
}
