import { useMemo, useState } from 'react';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import { useStudiesStore } from '../../store/useStudiesStore';

// Common-case duration presets — one tap = log a typical session.
// Custom duration still available via the input field.
const DURATION_PRESETS = [25, 45, 60, 90, 120];

export default function StudySessions() {
  const sessions = useStudiesStore((s) => s.studySessions);
  const courses = useStudiesStore((s) => s.courses);
  const addStudySession = useStudiesStore((s) => s.addStudySession);
  const deleteStudySession = useStudiesStore((s) => s.deleteStudySession);

  const [duration, setDuration] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  // ISO-local datetime input value. Default to "now" but rounded to the
  // current minute so the picker doesn't show stale seconds.
  const [startedAt, setStartedAt] = useState<string>(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return localDatetimeValue(d);
  });
  const [saving, setSaving] = useState(false);

  // Cap on the duration input (matches the server CHECK constraint).
  const durationNum = Math.max(0, Math.min(1440, parseInt(duration) || 0));

  const subjectName = useMemo(() => {
    return (id: string | undefined) => {
      if (!id) return '';
      return courses.find((c) => c.id === id)?.name ?? '';
    };
  }, [courses]);

  // This-week + all-time totals to help frame the session as part of a habit.
  const totals = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    const week = sessions
      .filter((s) => new Date(s.startedAt).getTime() >= cutoff)
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    const all = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
    return { week, all };
  }, [sessions]);

  const submit = async () => {
    if (durationNum <= 0) return;
    setSaving(true);
    await addStudySession({
      startedAt: new Date(startedAt).toISOString(),
      durationMinutes: durationNum,
      subjectId: subjectId || undefined,
      notes: notes.trim() || undefined,
    });
    setDuration('');
    setNotes('');
    setSaving(false);
  };

  return (
    <>
      <AppHeader
        title="Study Sessions"
        back="/studies"
        backLabel="Studies"
        showAvatar={false}
      />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="stat-box stat-box-hi">
            <div className="font-heading font-bold text-2xl tracking-tight">
              {formatHoursMinutes(totals.week)}
            </div>
            <div className="sec">This week</div>
          </div>
          <div className="stat-box">
            <div className="font-heading font-bold text-2xl tracking-tight">
              {formatHoursMinutes(totals.all)}
            </div>
            <div className="sec">All time</div>
          </div>
        </div>

        <div className="card space-y-2">
          <div className="font-heading font-semibold text-sm">Log Session</div>
          <div>
            <div className="sec mb-2">Duration</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {DURATION_PRESETS.map((m) => (
                <button
                  key={m}
                  onClick={() => setDuration(String(m))}
                  className={`chip ${durationNum === m ? 'chip-on' : ''}`}
                  type="button"
                >
                  {m}m
                </button>
              ))}
            </div>
            <input
              className="input"
              inputMode="numeric"
              placeholder="Custom minutes (1–1440)"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <div>
            <div className="sec mb-1">Subject (optional)</div>
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
          </div>

          <div>
            <div className="sec mb-1">Started</div>
            <input
              className="input"
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>

          <input
            className="input"
            placeholder="Notes… (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <button
            className="btn w-full"
            onClick={submit}
            disabled={saving || durationNum <= 0}
          >
            {saving ? 'Saving…' : 'Log Session'}
          </button>
        </div>

        <div className="card">
          <div className="font-heading font-semibold text-sm mb-2">Recent</div>
          {sessions.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">
              No sessions logged yet.
            </div>
          )}
          <div className="space-y-1">
            {sessions.slice(0, 30).map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">
                    {subjectName(s.subjectId) || 'General study'}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {relativeDay(s.startedAt)}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </div>
                </div>
                <span className="text-sm whitespace-nowrap font-medium">
                  {formatHoursMinutes(s.durationMinutes)}
                </span>
                <RowActions
                  onDelete={() => deleteStudySession(s.id)}
                  confirmMsg="Delete this session?"
                />
              </div>
            ))}
          </div>
          {sessions.length > 30 && (
            <div className="text-[10px] text-text-muted mt-2 text-center">
              Showing 30 of {sessions.length} · older sessions hidden for performance
            </div>
          )}
        </div>

        <div className="text-[10px] text-text-muted text-center">
          Queued locally · syncs when online
        </div>
      </div>
    </>
  );
}

function formatHoursMinutes(min: number): string {
  if (min <= 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format date as datetime-local input value in local time (the input expects
 *  "YYYY-MM-DDTHH:MM" without timezone — toISOString gives UTC which shifts
 *  the displayed clock by the local offset). */
function localDatetimeValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function relativeDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000,
  );
  const timeStr = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `Today ${timeStr}`;
  if (days === 1) return `Yesterday ${timeStr}`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('fi-FI', { day: '2-digit', month: 'short' });
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
