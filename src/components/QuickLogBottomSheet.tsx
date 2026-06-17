import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import TemplateChips from './TemplateChips';
import { useFinanceStore } from '../store/useFinanceStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useTaskStore } from '../store/useTaskStore';
import { useTemplatesStore } from '../store/useTemplatesStore';

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
  // v1.3.1 BUG-13 — Quick Log is now Account-aware. The v1.2 Account refactor
  // requires every expense/income transaction to carry an accountId so the
  // derived balance computation in lib/accountBalance.ts has a source.
  // Quick Log was missed in that refactor and was silently writing accountId
  // undefined, so QuickLog transactions never appeared in any account's
  // running balance. Picker is required (disabled submit until set) to match
  // the AddTransaction posture — no silent defaulting.
  const [accountId, setAccountId] = useState<string>('');
  const categories = useFinanceStore((s) => s.budgetCategories);
  const accounts = useFinanceStore((s) => s.manualAssets);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  // Only expense-type templates show on this tab (the tab is hard-coded
  // expense). Filtering here is cheaper than maintaining a separate cache.
  const templates = useTemplatesStore((s) =>
    s.transactions.filter((t) => t.type === 'expense'),
  );

  // When the user picks a category that has a pre-selected account (the
  // BudgetCategory.linkedManualAssetId hint — actually defaultAccountId
  // per the v1.2 follow-up rename comment), pre-fill the Account picker
  // unless the user has already chosen one explicitly. Same UX contract
  // as the full AddTransaction screen.
  useEffect(() => {
    if (accountId) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat?.linkedManualAssetId) setAccountId(cat.linkedManualAssetId);
  }, [categoryId, categories, accountId]);

  const submit = async () => {
    const n = parseFloat(amount);
    if (!n || !desc.trim() || !accountId) return;
    await addTransaction({
      amount: n,
      description: desc.trim(),
      categoryId: categoryId || undefined,
      accountId,
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
            // TransactionTemplate doesn't carry accountId (detection groups
            // across whichever account each occurrence used) — the user
            // still picks the account explicitly. The category's
            // linkedManualAssetId may still pre-fill via the effect below.
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
      <select
        className="input"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
      >
        <option value="">Account…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button
        className="btn w-full"
        onClick={submit}
        disabled={!amount || !desc.trim() || !accountId}
      >
        Save Expense
      </button>
    </div>
  );
}

function QuickGrade({ onDone }: { onDone: () => void }) {
  const courses = useStudiesStore((s) => s.courses);
  const addCourse = useStudiesStore((s) => s.addCourse);
  const addGrade = useStudiesStore((s) => s.addGrade);

  // Either select an existing course or type a new one. If new, we create
  // the course with default credits=1 and let the user edit later in the
  // Studies screen.
  const [subjectId, setSubjectId] = useState<string>('');
  const [newCourseName, setNewCourseName] = useState('');
  const [credits, setCredits] = useState('');
  const [grade, setGrade] = useState('');
  const [weight, setWeight] = useState('1');

  const submit = async () => {
    const g = parseFloat(grade);
    const w = parseFloat(weight);
    if (isNaN(g) || isNaN(w)) return;

    let targetSubjectId = subjectId;
    if (!targetSubjectId) {
      const name = newCourseName.trim();
      if (!name) return;
      const cr = parseFloat(credits) || 1;
      // addCourse generates the id internally — we need it to attach the
      // grade. The store mutator sets `courses` in state, so we read it back
      // by name+createdAt match. Simpler: pre-generate the course shape, then
      // call addCourse; the store will use its own generateId, so we instead
      // call addCourse then look up the newest matching row.
      await addCourse({ name, credits: cr });
      // Re-read from the store via a microtask: addCourse synchronously sets
      // `courses` in the closure-captured store state after awaiting.
      const fresh = useStudiesStore.getState().courses;
      const created = [...fresh].reverse().find((c) => c.name === name);
      if (!created) return;
      targetSubjectId = created.id;
    }

    await addGrade({
      subjectId: targetSubjectId,
      grade: g,
      weight: w,
      date: new Date().toISOString().slice(0, 10),
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      {courses.length > 0 && (
        <select
          className="input"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          <option value="">— New course —</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {subjectId === '' && (
        <>
          <input
            className="input"
            placeholder="Course name"
            value={newCourseName}
            onChange={(e) => setNewCourseName(e.target.value)}
          />
          <input
            className="input"
            inputMode="decimal"
            placeholder="Credits (default 1)"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
          />
        </>
      )}
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
