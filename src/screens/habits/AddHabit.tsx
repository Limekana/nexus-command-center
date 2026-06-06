// ─── v1.2 Habit add/edit screen ─────────────────────────────────────────
//
// Same pattern as AddReading: single screen used both for adding new habits
// (no ?id query param) and editing existing ones (?id=<uuid>). The form is
// dynamic — quantified-only inputs collapse when type=binary; specific-day
// picker collapses when frequencyKind=daily.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import { Pill } from '../../components/ui/Pill';
import { useHabitsStore } from '../../store/useHabitsStore';
import type { HabitType, HabitFrequencyKind } from '../../types/habits';

const TYPES: { key: HabitType; label: string; hint: string }[] = [
  { key: 'binary', label: 'Binary', hint: 'Did it or didn\'t' },
  { key: 'quantified', label: 'Quantified', hint: 'How much per day' },
];

const FREQS: { key: HabitFrequencyKind; label: string }[] = [
  { key: 'daily', label: 'Every day' },
  { key: 'specific_days', label: 'Specific days' },
];

const DAYS = [
  { idx: 0, short: 'Sun' },
  { idx: 1, short: 'Mon' },
  { idx: 2, short: 'Tue' },
  { idx: 3, short: 'Wed' },
  { idx: 4, short: 'Thu' },
  { idx: 5, short: 'Fri' },
  { idx: 6, short: 'Sat' },
];

// Pre-curated palette pulled from the Cyber Slate Glass tokens. Keeps
// things harmonious — the user can't pick a clashing color.
const COLORS = [
  '#00D4FF', // primary cyan
  '#3FB950', // success green
  '#D29922', // warning amber
  '#F85149', // danger red
  '#A78BFA', // soft violet
  '#F472B6', // soft pink
  '#94A3B8', // slate neutral
];

export default function AddHabit() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');

  const habits = useHabitsStore((s) => s.habits);
  const addHabit = useHabitsStore((s) => s.addHabit);
  const updateHabit = useHabitsStore((s) => s.updateHabit);
  const deleteHabit = useHabitsStore((s) => s.deleteHabit);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<HabitType>('binary');
  const [targetAmount, setTargetAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [frequencyKind, setFrequencyKind] = useState<HabitFrequencyKind>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]); // weekdays default
  const [reminderTime, setReminderTime] = useState('');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    const h = habits.find((x) => x.id === editId);
    if (!h) return;
    setTitle(h.title);
    setType(h.type);
    setTargetAmount(h.targetAmount != null ? String(h.targetAmount) : '');
    setUnit(h.unit ?? '');
    setFrequencyKind(h.frequencyKind);
    setDaysOfWeek(h.daysOfWeek ?? [1, 2, 3, 4, 5]);
    setReminderTime(h.reminderTime ?? '');
    setColor(h.color ?? COLORS[0]);
  }, [editId, habits]);

  function toggleDay(d: number) {
    setDaysOfWeek((current) =>
      current.includes(d)
        ? current.filter((x) => x !== d)
        : [...current, d].sort((a, b) => a - b),
    );
  }

  const submit = async () => {
    if (!title.trim()) return;
    if (type === 'quantified' && !targetAmount) return;
    if (frequencyKind === 'specific_days' && daysOfWeek.length === 0) return;
    setSaving(true);
    const target = type === 'quantified' ? parseFloat(targetAmount) : undefined;
    const payload = {
      title: title.trim(),
      type,
      targetAmount: target,
      unit: type === 'quantified' && unit.trim() ? unit.trim() : undefined,
      frequencyKind,
      daysOfWeek: frequencyKind === 'specific_days' ? daysOfWeek : undefined,
      reminderTime: reminderTime || undefined,
      color: color || undefined,
    };
    if (editId) {
      await updateHabit(editId, payload);
    } else {
      await addHabit(payload);
    }
    setSaving(false);
    navigate('/habits');
  };

  const onDelete = async () => {
    if (!editId) return;
    if (!confirm(`Delete "${title}" and its history?`)) return;
    await deleteHabit(editId);
    navigate('/habits');
  };

  const validationMsg = !title.trim()
    ? 'Give it a name.'
    : type === 'quantified' && !targetAmount
      ? 'How much per day?'
      : frequencyKind === 'specific_days' && daysOfWeek.length === 0
        ? 'Pick at least one day.'
        : null;

  return (
    <>
      <AppHeader
        title={editId ? 'Edit Habit' : 'New Habit'}
        back="/habits"
        backLabel="Habits"
        showAvatar={false}
      />
      <div className="space-y-4">
        {/* Type */}
        <div>
          <div className="sec mb-2">Type</div>
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <Pill
                key={t.key}
                on={type === t.key}
                onClick={() => setType(t.key)}
              >
                {t.label}
              </Pill>
            ))}
          </div>
          <div className="text-[10px] text-text-muted mt-1.5">
            {TYPES.find((t) => t.key === type)?.hint}
          </div>
        </div>

        {/* Title — v1.2 UI/UX review #6: wrapped in <label> so the visual
            mini-header is programmatically tied to its input. Screen readers
            now announce "Title, edit text" instead of just "edit text". */}
        <label className="block">
          <div className="sec mb-2">Title</div>
          <input
            className="input"
            placeholder={type === 'binary' ? 'e.g. Meditate' : 'e.g. Read'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>

        {/* Quantified-only — target + unit.  Two real <label>s side-by-side
            so the amount + unit each announce their own header in screen
            readers. The glass-card wrapper is purely visual. */}
        {type === 'quantified' && (
          <div className="glass rounded-xl p-3 space-y-2 animate-fade-in-up">
            <div className="sec">Daily target</div>
            <div className="flex gap-2">
              <label className="flex-1 block">
                <span className="sr-only">Target amount</span>
                <input
                  className="input w-full"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                />
              </label>
              <label className="flex-1 block">
                <span className="sr-only">Unit</span>
                <input
                  className="input w-full"
                  placeholder="Unit (e.g. pages)"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </label>
            </div>
            <div className="text-[10px] text-text-muted">
              A day counts as done when you hit the amount.
            </div>
          </div>
        )}

        {/* Frequency */}
        <div>
          <div className="sec mb-2">Frequency</div>
          <div className="flex gap-2">
            {FREQS.map((f) => (
              <Pill
                key={f.key}
                on={frequencyKind === f.key}
                onClick={() => setFrequencyKind(f.key)}
              >
                {f.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* Specific-day picker */}
        {frequencyKind === 'specific_days' && (
          <div className="glass rounded-xl p-3 space-y-2 animate-fade-in-up">
            <div className="sec">Days of week</div>
            {/* v1.2 UI/UX review #5 — default-size Pill keeps the touch
                target ≥40px (the .pill base height). size="sm" rendered
                under-spec for WCAG 2.5.5. The row stays a single line on
                360px+ devices because seven 3-letter labels fit comfortably
                in the .pill horizontal padding. */}
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((d) => (
                <Pill
                  key={d.idx}
                  on={daysOfWeek.includes(d.idx)}
                  onClick={() => toggleDay(d.idx)}
                >
                  {d.short}
                </Pill>
              ))}
            </div>
            <div className="text-[10px] text-text-muted">
              Streak grace still applies — one missed scheduled day per
              7 days won't break the streak.
            </div>
          </div>
        )}

        {/* Reminder — wrapped in <label> for the same a11y reason as Title. */}
        <label className="block">
          <div className="sec mb-2">Reminder (optional)</div>
          <input
            type="time"
            className="input"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
          />
          <div className="text-[10px] text-text-muted mt-1">
            {reminderTime
              ? `You'll get a notification at ${reminderTime} on eligible days.`
              : 'Leave blank for no reminder.'}
          </div>
        </label>

        {/* Color swatches */}
        <div>
          <div className="sec mb-2">Color</div>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Pick color ${c}`}
                // v1.2 UI/UX review #4 — w-11 h-11 meets WCAG 2.5.5 (44×44).
                // The selected ring stays as a scale-110 outline so the
                // emphasized state remains visually distinct from idle.
                className={`w-11 h-11 rounded-full press-spring border-2 transition-transform ${
                  color === c
                    ? 'border-text scale-110'
                    : 'border-glass-border scale-100'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        {validationMsg && (
          <div className="glass-soft rounded-lg p-2 text-[11px] text-warning text-center">
            {validationMsg}
          </div>
        )}

        <button
          className="btn w-full"
          onClick={submit}
          disabled={saving || validationMsg != null}
        >
          {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Habit'}
        </button>
        {editId && (
          <button
            className="btn-ghost w-full text-danger border-danger/40"
            onClick={onDelete}
          >
            Delete Habit
          </button>
        )}
        <div className="text-[10px] text-text-muted text-center">
          Synced across devices when online
        </div>
      </div>
    </>
  );
}
