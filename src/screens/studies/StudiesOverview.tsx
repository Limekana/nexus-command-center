import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import HeatmapCalendar from '../../components/HeatmapCalendar';
import { useStudiesStore } from '../../store/useStudiesStore';
import { gradeToLetter, gradeScaleLabel, ibBand } from '../../utils/gpa';
import { localDateKey } from '../../utils/formatters';
import { Course } from '../../types/studies';

export default function StudiesOverview() {
  const navigate = useNavigate();
  const currentImport = useStudiesStore((s) => s.currentImport);
  const courses = useStudiesStore((s) => s.courses);
  const previousGpa = useStudiesStore((s) => s.previousGpa);
  const gradeMode = useStudiesStore((s) => s.gradeMode);
  const setGradeMode = useStudiesStore((s) => s.setGradeMode);
  const addCourse = useStudiesStore((s) => s.addCourse);
  const updateCourse = useStudiesStore((s) => s.updateCourse);
  const deleteCourse = useStudiesStore((s) => s.deleteCourse);
  const studySessions = useStudiesStore((s) => s.studySessions);
  const readings = useStudiesStore((s) => s.readings);

  // Weekly study minutes — past 7 days, sum of durationMinutes.
  const weeklyStudyMinutes = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    return studySessions
      .filter((s) => new Date(s.startedAt).getTime() >= cutoff)
      .reduce((sum, s) => sum + s.durationMinutes, 0);
  }, [studySessions]);

  // Heatmap: combined study activity per day. Study sessions contribute
  // their actual minutes; reading status changes contribute a 30-minute
  // equivalent so the Library lights up the grid too. This way the heatmap
  // is useful for users who track grades + readings but don't bother with
  // explicit study-session logging.
  const studyMinutesByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of studySessions) {
      const key = localDateKey(new Date(s.startedAt));
      map.set(key, (map.get(key) ?? 0) + s.durationMinutes);
    }
    // Add reading activity: 30min per status change moment (start / finish).
    // Using updatedAt as the proxy when status events aren't separately stored.
    for (const r of readings) {
      const stamps: string[] = [];
      if (r.startedAt) stamps.push(r.startedAt);
      if (r.finishedAt) stamps.push(r.finishedAt);
      if (stamps.length === 0) stamps.push(r.updatedAt);
      for (const stamp of stamps) {
        const key = localDateKey(new Date(stamp));
        map.set(key, (map.get(key) ?? 0) + 30);
      }
    }
    return map;
  }, [studySessions, readings]);

  // Reading counts by status for the library summary card.
  const readingCounts = useMemo(() => {
    return readings.reduce(
      (acc, r) => {
        acc[r.status]++;
        return acc;
      },
      { to_read: 0, reading: 0, finished: 0, abandoned: 0 } as Record<string, number>,
    );
  }, [readings]);

  const [editing, setEditing] = useState<Course | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [weight, setWeight] = useState('');
  const [semester, setSemester] = useState('');

  const startAdd = () => {
    setEditing(null);
    setAdding(true);
    setName('');
    setGrade('');
    setWeight('');
    setSemester('');
  };

  const startEdit = (c: Course) => {
    setAdding(false);
    setEditing(c);
    setName(c.name);
    setGrade(String(c.grade));
    setWeight(String(c.weight));
    setSemester(c.semester ?? '');
  };

  const cancel = () => {
    setEditing(null);
    setAdding(false);
  };

  const save = async () => {
    const g = parseFloat(grade);
    const w = parseFloat(weight);
    if (!name.trim() || isNaN(g) || isNaN(w)) return;
    if (gradeMode === 'ib' && (g < 1 || g > 7)) {
      alert('IB grade must be between 1 and 7.');
      return;
    }
    if (gradeMode === 'us' && (g < 0 || g > 100)) {
      alert('Grade must be between 0 and 100.');
      return;
    }
    if (editing) {
      await updateCourse(editing.id, {
        name: name.trim(),
        grade: g,
        weight: w,
        semester: semester.trim() || undefined,
      });
    } else {
      await addCourse({
        name: name.trim(),
        grade: g,
        weight: w,
        semester: semester.trim() || undefined,
      });
    }
    cancel();
  };

  const gpa = currentImport?.calculatedGpa;
  const delta = gpa != null && previousGpa != null ? gpa - previousGpa : null;
  const editingNow = adding || editing != null;

  return (
    <>
      <AppHeader
        title="Studies"
        action={
          <>
            <button
              onClick={() => navigate('/studies/import')}
              className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
            >
              Import
            </button>
            {!editingNow && (
              <button
                onClick={startAdd}
                className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
              >
                + Course
              </button>
            )}
          </>
        }
      />
      <div className="space-y-3">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-primary/60 bg-primary/5 shadow-glow flex items-center justify-center font-heading font-bold text-lg">
              {gpa != null ? gpa.toFixed(2) : '—'}
            </div>
            <div className="flex-1">
              <div className="font-heading font-semibold text-sm">
                Current GPA <span className="text-text-muted text-[10px]">{gradeScaleLabel(gradeMode)}</span>
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">
                {delta != null ? (
                  <>
                    <span className={delta >= 0 ? 'text-success' : 'text-danger'}>
                      {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(2)} pts
                    </span>{' '}
                    · {courses.length} courses
                  </>
                ) : currentImport ? (
                  `${courses.length} courses`
                ) : (
                  'No courses yet'
                )}
              </div>
              {gradeMode === 'ib' && gpa != null && (
                <div className="text-[10px] text-text-muted">{ibBand(gpa)}</div>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setGradeMode('us')}
              className={`chip flex-1 ${gradeMode === 'us' ? 'chip-on' : ''}`}
            >
              US (0–100 → 4.0)
            </button>
            <button
              onClick={() => setGradeMode('ib')}
              className={`chip flex-1 ${gradeMode === 'ib' ? 'chip-on' : ''}`}
            >
              IB (1–7)
            </button>
          </div>
        </div>

        {editingNow && (
          <div className="card space-y-2">
            <div className="font-heading font-semibold text-sm">
              {editing ? 'Edit Course' : 'New Course'}
            </div>
            <input
              className="input"
              placeholder="Course name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <input
                className="input"
                placeholder={gradeMode === 'ib' ? 'Grade (1–7)' : 'Grade (0–100)'}
                inputMode="decimal"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              />
              <input
                className="input"
                placeholder="Weight (e.g. 25)"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <input
              className="input"
              placeholder="Semester (optional)"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={save}>
                {editing ? 'Save' : 'Add'}
              </button>
              <button className="btn-ghost flex-1" onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-heading font-semibold text-sm">Course Grades</span>
            {currentImport && (
              <span className="text-[9px] uppercase tracking-wider text-text-muted border border-border rounded-sm px-1.5 py-0.5">
                {currentImport.source === 'csv' ? 'StudyDesk CSV' : 'Manual'}
              </span>
            )}
          </div>
          <div className="space-y-1">
            {courses.length === 0 && (
              <div className="text-xs text-text-muted text-center py-4">
                No courses yet — tap + Course or Import a CSV
              </div>
            )}
            {courses.map((c) => (
              <div key={c.id} className="flex items-center gap-2 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{c.name}</div>
                  {c.semester && (
                    <div className="text-[10px] text-text-muted">{c.semester}</div>
                  )}
                </div>
                <span className="text-sm whitespace-nowrap">
                  {gradeMode === 'ib' ? `${c.grade}/7` : `${gradeToLetter(c.grade)} — ${c.grade}%`}{' '}
                  <span className="text-text-muted">({c.weight}%)</span>
                </span>
                <RowActions
                  onEdit={() => startEdit(c)}
                  onDelete={() => deleteCourse(c.id)}
                  confirmMsg={`Delete "${c.name}"?`}
                />
              </div>
            ))}
          </div>
          {courses.length > 0 && (
            <div className="text-[10px] text-text-muted mt-2">
              Weight-adjusted · {courses.length} courses total
            </div>
          )}
        </div>

        {(courses.length > 0 || studySessions.length > 0 || readings.length > 0) && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="font-heading font-semibold text-sm">Study Streak</span>
              <span className="text-[9px] uppercase tracking-wider text-text-muted">365 days · minutes</span>
            </div>
            <HeatmapCalendar data={studyMinutesByDay} tint="primary" unit="min" />
            {studySessions.length === 0 && (
              <div className="text-[10px] text-text-muted mt-2 text-center">
                {readings.length > 0
                  ? 'Reading activity is shown. Log study sessions to fill more cells.'
                  : 'Log a study session to start filling this in.'}
              </div>
            )}
          </div>
        )}

        {/* v2-B summary cards: Study Time + Reading Library.
          * Each card links to its dedicated screen. Both tap targets fill the
          * full card so there's no aim required (mobile ergonomics). */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate('/studies/sessions')}
            className="card text-left active:scale-[0.98]"
          >
            <div className="sec mb-1">Study Time</div>
            <div className="font-heading font-bold text-2xl tracking-tight">
              {formatHoursMinutes(weeklyStudyMinutes)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {studySessions.length === 0
                ? 'No sessions yet'
                : `Last 7 days · ${studySessions.length} session${studySessions.length === 1 ? '' : 's'} total`}
            </div>
          </button>

          <button
            onClick={() => navigate('/studies/library')}
            className="card text-left active:scale-[0.98]"
          >
            <div className="sec mb-1">Library</div>
            <div className="font-heading font-bold text-2xl tracking-tight">
              {readings.length === 0 ? '—' : readingCounts.finished}
              {readings.length > 0 && (
                <span className="text-sm text-text-muted font-normal"> read</span>
              )}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {readings.length === 0
                ? 'No books logged'
                : readingCounts.reading > 0
                  ? `${readingCounts.reading} reading · ${readingCounts.to_read} queued`
                  : `${readingCounts.to_read} queued`}
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

/** Format N minutes as "Xh Ym" with sane edge cases. */
function formatHoursMinutes(min: number): string {
  if (min <= 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
