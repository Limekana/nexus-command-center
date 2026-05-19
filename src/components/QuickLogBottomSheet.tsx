import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import TemplateChips from './TemplateChips';
import { useFinanceStore } from '../store/useFinanceStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useTaskStore } from '../store/useTaskStore';
import { useTemplatesStore } from '../store/useTemplatesStore';
import { calculateGPA } from '../utils/gpa';
import { generateId } from '../utils/uuid';
import { db } from '../db/database';
import { enqueue } from '../db/syncQueue';

type QuickTab = 'expense' | 'grade' | 'session' | 'set' | 'task';

interface QuickLogBottomSheetProps {
  open: boolean;
  onClose: () => void;
}

const tabs: { key: QuickTab; label: string }[] = [
  { key: 'expense', label: '💸 Expense' },
  { key: 'grade', label: '📚 Grade' },
  { key: 'session', label: '⏱ Session' },
  { key: 'set', label: '💪 Set' },
  { key: 'task', label: '✅ Task' },
];

export default function QuickLogBottomSheet({ open, onClose }: QuickLogBottomSheetProps) {
  const [tab, setTab] = useState<QuickTab>('expense');
  const refreshTemplates = useTemplatesStore((s) => s.refresh);

  // Refresh on each open so chips reflect anything logged since the last
  // FAB open — the sheet stays mounted, so a one-shot mount effect would
  // not catch subsequent opens.
  useEffect(() => {
    if (open) void refreshTemplates();
  }, [open, refreshTemplates]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Quick Log">
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`chip flex-shrink-0 ${tab === t.key ? 'chip-on' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'expense' && <QuickExpense onDone={onClose} />}
      {tab === 'grade' && <QuickGrade onDone={onClose} />}
      {tab === 'session' && <QuickSession onDone={onClose} />}
      {tab === 'set' && <QuickSet onDone={onClose} />}
      {tab === 'task' && <QuickTask onDone={onClose} />}
      <div className="text-[10px] text-text-muted text-center mt-3">
        DIFS target &lt;15 sec · queued locally
      </div>
    </BottomSheet>
  );
}

function QuickExpense({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const categories = useFinanceStore((s) => s.budgetCategories);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  // Only expense-type templates show on this tab (the tab is hard-coded
  // expense). Filtering here is cheaper than maintaining a separate cache.
  const templates = useTemplatesStore((s) =>
    s.transactions.filter((t) => t.type === 'expense'),
  );

  const submit = async () => {
    const n = parseFloat(amount);
    if (!n || !desc.trim()) return;
    await addTransaction({
      amount: n,
      description: desc.trim(),
      categoryId: categoryId || undefined,
      date: new Date().toISOString().slice(0, 10),
      type: 'expense',
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <TemplateChips
          templates={templates}
          onPick={(t) => {
            setAmount(String(t.amount));
            setDesc(t.description);
            if (t.categoryId) setCategoryId(t.categoryId);
          }}
          label={(t) => (
            <>
              <span className="truncate max-w-[110px]">{t.description}</span>
              <span className="opacity-60">·</span>
              <span className="font-medium">{t.amount.toFixed(2)}€</span>
            </>
          )}
        />
      )}
      <div className="flex gap-2">
        <input
          className="input max-w-[110px]"
          inputMode="decimal"
          placeholder="€ Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="input"
          placeholder="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>
      <select
        className="input"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">Category…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon ? `${c.icon} ` : ''}{c.name}
          </option>
        ))}
      </select>
      <button className="btn w-full" onClick={submit}>
        Save Expense
      </button>
    </div>
  );
}

function QuickGrade({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [weight, setWeight] = useState('');
  const courses = useStudiesStore((s) => s.courses);
  const currentImport = useStudiesStore((s) => s.currentImport);
  const loadStudies = useStudiesStore((s) => s.load);

  const submit = async () => {
    const g = parseFloat(grade);
    const w = parseFloat(weight);
    if (!name.trim() || isNaN(g) || isNaN(w)) return;
    const importId = currentImport?.id ?? generateId();
    const now = new Date().toISOString();
    const newCourse = {
      id: generateId(),
      importId,
      name: name.trim(),
      weight: w,
      grade: g,
      createdAt: now,
    };
    if (!currentImport) {
      await db.gradeImports.add({
        id: importId,
        importedAt: now,
        source: 'manual',
        calculatedGpa: 0,
        courses: [],
      });
    }
    await db.courses.add(newCourse);
    const allCourses = [...courses, newCourse];
    const gpa = calculateGPA(allCourses);
    await db.gradeImports.update(importId, { calculatedGpa: gpa });
    await enqueue('course', newCourse.id, 'insert', newCourse);
    await loadStudies();
    onDone();
  };

  return (
    <div className="space-y-3">
      <input
        className="input"
        placeholder="Course name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="input"
          inputMode="decimal"
          placeholder="Grade (0–100)"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />
        <input
          className="input"
          inputMode="decimal"
          placeholder="Weight"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </div>
      <button className="btn w-full" onClick={submit}>
        Save Grade
      </button>
    </div>
  );
}

function QuickSet({ onDone }: { onDone: () => void }) {
  const [exercise, setExercise] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const startOrGet = useFitnessStore((s) => s.startOrGetTodaySession);
  const addSet = useFitnessStore((s) => s.addSet);
  const templates = useTemplatesStore((s) => s.workouts);

  const submit = async () => {
    if (!exercise.trim() || !reps) return;
    const sid = await startOrGet('push');
    await addSet(sid, {
      exercise: exercise.trim(),
      weightKg: weightKg ? parseFloat(weightKg) : undefined,
      reps: parseInt(reps),
      rpe: rpe ? parseInt(rpe) : undefined,
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <TemplateChips
          templates={templates}
          onPick={(t) => {
            setExercise(t.exercise);
            setWeightKg(t.weightKg != null ? String(t.weightKg) : '');
            setReps(t.reps != null ? String(t.reps) : '');
          }}
          label={(t) => (
            <>
              <span className="truncate max-w-[110px]">{t.exercise}</span>
              <span className="opacity-60">·</span>
              <span className="font-medium whitespace-nowrap">
                {t.weightKg != null ? `${t.weightKg}kg×${t.reps}` : `BW×${t.reps}`}
              </span>
            </>
          )}
        />
      )}
      <input
        className="input"
        placeholder="Exercise (e.g. Bench Press)"
        value={exercise}
        onChange={(e) => setExercise(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="input"
          inputMode="decimal"
          placeholder="Weight (kg)"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
        <input
          className="input"
          inputMode="numeric"
          placeholder="Reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
        />
        <input
          className="input"
          inputMode="numeric"
          placeholder="RPE"
          value={rpe}
          onChange={(e) => setRpe(e.target.value)}
        />
      </div>
      <button className="btn w-full" onClick={submit}>
        Log Set
      </button>
    </div>
  );
}

// Sub-15s study-session logger. Duration presets cover ~90% of typical
// sessions (Pomodoro, full hour, lecture chunks); the custom field is for
// outliers. Subject defaults to "General study" to avoid forcing a choice.
function QuickSession({ onDone }: { onDone: () => void }) {
  const [duration, setDuration] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const courses = useStudiesStore((s) => s.courses);
  const addStudySession = useStudiesStore((s) => s.addStudySession);

  const submit = async () => {
    const n = parseInt(duration);
    if (!n || n <= 0 || n > 1440) return;
    await addStudySession({
      startedAt: new Date().toISOString(),
      durationMinutes: n,
      subjectId: subjectId || undefined,
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="sec mb-2">Duration</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {[25, 45, 60, 90].map((m) => (
            <button
              key={m}
              onClick={() => setDuration(String(m))}
              className={`chip ${parseInt(duration) === m ? 'chip-on' : ''}`}
              type="button"
            >
              {m}m
            </button>
          ))}
        </div>
        <input
          className="input"
          inputMode="numeric"
          placeholder="Custom minutes"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <select
        className="input"
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value)}
      >
        <option value="">General study</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        className="btn w-full"
        onClick={submit}
        disabled={!duration || parseInt(duration) <= 0}
      >
        Log Session
      </button>
    </div>
  );
}

function QuickTask({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  // Default priority+category from the picked template; falls back to
  // medium/personal (the previous hard-coded behavior) for blank submissions.
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [category, setCategory] = useState<'study' | 'personal' | 'finance' | 'work'>('personal');
  const addTask = useTaskStore((s) => s.addTask);
  const templates = useTemplatesStore((s) => s.tasks);

  const submit = async () => {
    if (!title.trim()) return;
    await addTask({
      title: title.trim(),
      dueDate: due ? new Date(due).toISOString() : undefined,
      priority,
      category,
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <TemplateChips
          templates={templates}
          onPick={(t) => {
            setTitle(t.title);
            setPriority(t.priority);
            if (t.category) setCategory(t.category);
          }}
          label={(t) => <span className="truncate max-w-[160px]">{t.title}</span>}
        />
      )}
      <input
        className="input"
        placeholder="What needs to be done?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="input"
        type="datetime-local"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <button className="btn w-full" onClick={submit}>
        Save Task
      </button>
    </div>
  );
}
