// ─── v1.5 WorkRatingCard ─────────────────────────────────────────────────
//
// Home-tab daily self-assessment for the NCC-native Work domain. "How was
// work today?" on a 1–5 scale + an optional short note. Feeds the Work score
// that the Professional / Custom Life Profiles weight into the Life Score.
//
// Visibility rules (matches the v1.5 plan):
//   - only when the active Life Profile includes Work (weight > 0)
//   - only from noon onward — no point rating the day at 7am
//   - hidden on weekends (default off; work-life ratings are a weekday ritual)
//
// Cyber Slate Glass: glass card, cyan-lit selected circle with spring press,
// inline note that collapses when empty.

import { useEffect, useRef, useState } from 'react';
import { useWorkQualityStore, todayKey } from '../store/useWorkQualityStore';
import { useLifeProfileStore } from '../store/useLifeProfileStore';

const NOTE_MAX = 120;
const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WorkRatingCard() {
  const workWeight = useLifeProfileStore((s) => s.profile.domains.work);
  const logs = useWorkQualityStore((s) => s.logs);
  const loaded = useWorkQualityStore((s) => s.loaded);
  const load = useWorkQualityStore((s) => s.load);
  const setRating = useWorkQualityStore((s) => s.setRating);
  const setNote = useWorkQualityStore((s) => s.setNote);

  const today = todayKey();
  const todayLog = logs.find((l) => l.date === today);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const noteHydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // Keep the local note draft in sync with the stored note for today, but only
  // re-seed when the underlying note identity changes (not on every keystroke).
  useEffect(() => {
    if (noteHydratedFor.current !== today) {
      setNoteDraft(todayLog?.note ?? '');
      noteHydratedFor.current = today;
      if (todayLog?.note) setNoteOpen(true);
    }
  }, [today, todayLog?.note]);

  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay();

  // Gate: only for Work-enabled profiles, weekday afternoons.
  if (!workWeight || workWeight <= 0) return null;
  if (dow === 0 || dow === 6) return null;
  if (hour < 12) return null;

  const rating = todayLog?.rating ?? 0;

  const onPickRating = (n: number) => {
    // Preserve the existing note (pass undefined to keep it).
    void setRating(n, undefined, today);
  };

  const onNoteBlur = () => {
    void setNote(noteDraft, today);
    if (!noteDraft.trim()) setNoteOpen(false);
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">
          {rating > 0 ? 'Work today — tap to change' : 'How was work today?'}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {DAY_LABEL[dow]}
        </span>
      </div>

      <div className="flex gap-2.5" role="group" aria-label="Rate your work day 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = rating === n;
          return (
            <button
              key={n}
              onClick={() => onPickRating(n)}
              aria-pressed={on}
              aria-label={`${n} out of 5`}
              className={`press-spring flex-1 h-11 rounded-xl border text-lg font-heading font-semibold transition-colors ${
                on
                  ? 'border-primary/60 bg-primary/12 text-primary shadow-glow'
                  : 'border-glass-border text-text-muted'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {noteOpen ? (
        <textarea
          className="input mt-3 resize-none h-16 text-sm"
          placeholder="Add a note… (optional)"
          maxLength={NOTE_MAX}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={onNoteBlur}
          autoFocus
        />
      ) : (
        <button
          onClick={() => setNoteOpen(true)}
          className="mt-3 text-xs text-text-muted/80 active:text-primary"
        >
          {todayLog?.note ? `“${todayLog.note}”` : '+ Add a note'}
        </button>
      )}
    </div>
  );
}
