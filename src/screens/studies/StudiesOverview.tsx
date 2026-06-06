import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import HeatmapCalendar from '../../components/HeatmapCalendar';
import { useStudiesStore, indexGradesBySubject } from '../../store/useStudiesStore';
import { gradeToLetter, gradeScaleLabel, ibBand, subjectScore } from '../../utils/gpa';
import { localDateKey } from '../../utils/formatters';
import { Course, Grade } from '../../types/studies';

export default function StudiesOverview() {
  const navigate = useNavigate();
  const currentImport = useStudiesStore((s) => s.currentImport);
  const courses = useStudiesStore((s) => s.courses);
  const archivedCourses = useStudiesStore((s) => s.archivedCourses);
  const grades = useStudiesStore((s) => s.grades);
  const previousGpa = useStudiesStore((s) => s.previousGpa);
  const gradeMode = useStudiesStore((s) => s.gradeMode);
  const setGradeMode = useStudiesStore((s) => s.setGradeMode);
  const addCourse = useStudiesStore((s) => s.addCourse);
  const updateCourse = useStudiesStore((s) => s.updateCourse);
  const deleteCourse = useStudiesStore((s) => s.deleteCourse);
  const restoreCourse = useStudiesStore((s) => s.restoreCourse);
  const addGrade = useStudiesStore((s) => s.addGrade);
  const updateGrade = useStudiesStore((s) => s.updateGrade);
  const deleteGrade = useStudiesStore((s) => s.deleteGrade);
  const studySessions = useStudiesStore((s) => s.studySessions);
  const readings = useStudiesStore((s) => s.readings);

  // v1.2 — Show archived toggle. Archived semesters disappear from the main
  // course list + GPA. The toggle reveals a grouped read-mostly view below
  // the active courses with a Restore action per row. Default closed.
  const [showArchived, setShowArchived] = useState(false);

  // Group archived courses by semester for the collapsible section. Courses
  // without a semester land under "Other archived".
  const archivedBySemester = useMemo(() => {
    const groups: Record<string, Course[]> = {};
    for (const c of archivedCourses) {
      const key = c.semester ?? 'Other archived';
      (groups[key] ??= []).push(c);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sem, list]) => ({ semester: sem, courses: list }));
  }, [archivedCourses]);

  // Per-subject grade index — single computation reused for the GPA badge,
  // the per-course display value, and the inline grade list.
  const gradesBySubject = useMemo(() => indexGradesBySubject(grades), [grades]);

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

  // Course edit/add form state
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [addingCourse, setAddingCourse] = useState(false);
  const [name, setName] = useState('');
  const [credits, setCredits] = useState('');
  const [color, setColor] = useState('');
  const [semester, setSemester] = useState('');

  // Grade add/edit form state — scoped to a single subject
  const [addingGradeFor, setAddingGradeFor] = useState<string | null>(null);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [gradeValue, setGradeValue] = useState('');
  const [gradeWeight, setGradeWeight] = useState('');
  const [gradeDate, setGradeDate] = useState('');

  // Per-subject expand/collapse for the grade list
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const startAddCourse = () => {
    setEditingCourse(null);
    setAddingCourse(true);
    setName('');
    setCredits('');
    setColor('');
    setSemester('');
  };

  const startEditCourse = (c: Course) => {
    setAddingCourse(false);
    setEditingCourse(c);
    setName(c.name);
    setCredits(String(c.credits));
    setColor(c.color ?? '');
    setSemester(c.semester ?? '');
  };

  const cancelCourse = () => {
    setEditingCourse(null);
    setAddingCourse(false);
  };

  const saveCourse = async () => {
    const cr = parseFloat(credits);
    if (!name.trim() || isNaN(cr) || cr <= 0) {
      alert('Course name and credit value (> 0) required.');
      return;
    }
    const colorClean = color.trim() || undefined;
    if (editingCourse) {
      await updateCourse(editingCourse.id, {
        name: name.trim(),
        credits: cr,
        color: colorClean,
        semester: semester.trim() || undefined,
      });
    } else {
      await addCourse({
        name: name.trim(),
        credits: cr,
        color: colorClean,
        semester: semester.trim() || undefined,
      });
    }
    cancelCourse();
  };

  const startAddGrade = (courseId: string) => {
    setEditingGrade(null);
    setAddingGradeFor(courseId);
    setGradeValue('');
    setGradeWeight('1');
    setGradeDate(new Date().toISOString().slice(0, 10));
    // Open the subject's grade list so the user sees what they're editing
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(courseId);
      return next;
    });
  };

  const startEditGrade = (g: Grade) => {
    setAddingGradeFor(null);
    setEditingGrade(g);
    setGradeValue(String(g.grade));
    setGradeWeight(String(g.weight));
    setGradeDate(g.date ?? '');
  };

  const cancelGrade = () => {
    setEditingGrade(null);
    setAddingGradeFor(null);
  };

  const saveGrade = async () => {
    const gv = parseFloat(gradeValue);
    const gw = parseFloat(gradeWeight);
    if (isNaN(gv) || isNaN(gw)) {
      alert('Grade and weight required.');
      return;
    }
    if (gradeMode === 'ib' && (gv < 1 || gv > 7)) {
      alert('IB grade must be between 1 and 7.');
      return;
    }
    if (gradeMode === 'us' && (gv < 0 || gv > 100)) {
      alert('Grade must be between 0 and 100.');
      return;
    }
    const dateClean = gradeDate.trim() || undefined;
    if (editingGrade) {
      await updateGrade(editingGrade.id, {
        grade: gv,
        weight: gw,
        date: dateClean,
      });
    } else if (addingGradeFor) {
      await addGrade({
        subjectId: addingGradeFor,
        grade: gv,
        weight: gw,
        date: dateClean,
      });
    }
    cancelGrade();
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const gpa = currentImport?.calculatedGpa;
  const delta = gpa != null && previousGpa != null ? gpa - previousGpa : null;
  const editingNow = addingCourse || editingCourse != null;

  return (
    <>
      <AppHeader
        title="Studies"
        action={
          <>
            {!editingNow && (
              <button
                onClick={startAddCourse}
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
              {editingCourse ? 'Edit Course' : 'New Course'}
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
                placeholder="Credits (e.g. 5)"
                inputMode="decimal"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
              />
              <input
                className="input"
                placeholder="Color (e.g. #4f46e5)"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <input
              className="input"
              placeholder="Semester (optional)"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={saveCourse}>
                {editingCourse ? 'Save' : 'Add'}
              </button>
              <button className="btn-ghost flex-1" onClick={cancelCourse}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-heading font-semibold text-sm">Course Grades</span>
            {/* Source tag removed in v1.0.1 — CSV import path is gone now
                that StudyDesk grades flow in via realtime Supabase sync. */}
          </div>
          <div className="space-y-1">
            {courses.length === 0 && (
              <div className="text-xs text-text-muted text-center py-4">
                No courses yet — tap + Course or sync from StudyDesk
              </div>
            )}
            {courses.map((c) => {
              const subjectGrades = (gradesBySubject.get(c.id) ?? []).slice().sort(
                (a, b) => (b.date ?? '').localeCompare(a.date ?? ''),
              );
              const score = subjectScore(subjectGrades);
              const isExpanded = expanded.has(c.id);
              const showAddGradeForm = addingGradeFor === c.id;
              const dotStyle = c.color
                ? { backgroundColor: c.color }
                : undefined;
              return (
                <div key={c.id} className="border-b border-white/5 last:border-0 pb-1.5 last:pb-0">
                  <button
                    onClick={() => toggleExpanded(c.id)}
                    className="w-full flex items-center gap-2 py-1.5 text-left"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        c.color ? '' : 'bg-primary/60'
                      }`}
                      style={dotStyle}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{c.name}</div>
                      {c.semester && (
                        <div className="text-[10px] text-text-muted">{c.semester}</div>
                      )}
                    </div>
                    <span className="text-sm whitespace-nowrap">
                      {score == null
                        ? <span className="text-text-muted">—</span>
                        : gradeMode === 'ib'
                          ? `${score.toFixed(1)}/7`
                          : `${gradeToLetter(score)} — ${score.toFixed(1)}%`}{' '}
                      <span className="text-text-muted">({c.credits} cr)</span>
                    </span>
                    <RowActions
                      onEdit={() => startEditCourse(c)}
                      onDelete={() => deleteCourse(c.id)}
                      confirmMsg={`Delete "${c.name}" and all its grades?`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="pl-4 pb-2 space-y-1">
                      {subjectGrades.length === 0 && !showAddGradeForm && (
                        <div className="text-[10px] text-text-muted italic">
                          No grades yet for this course.
                        </div>
                      )}
                      {subjectGrades.map((g) => (
                        <div
                          key={g.id}
                          className="flex items-center gap-2 text-[11px] py-1"
                        >
                          <span className="text-text-muted w-20 flex-shrink-0">
                            {g.date ?? '—'}
                          </span>
                          <span className="flex-1">
                            {gradeMode === 'ib'
                              ? `${g.grade}/7`
                              : `${g.grade}%`}{' '}
                            <span className="text-text-muted">
                              (weight {g.weight})
                            </span>
                          </span>
                          <RowActions
                            onEdit={() => startEditGrade(g)}
                            onDelete={() => deleteGrade(g.id)}
                            confirmMsg="Delete this grade?"
                          />
                        </div>
                      ))}
                      {!showAddGradeForm && !editingGrade && (
                        <button
                          onClick={() => startAddGrade(c.id)}
                          className="text-[10px] text-primary active:opacity-60"
                        >
                          + Add grade
                        </button>
                      )}
                      {(showAddGradeForm ||
                        (editingGrade &&
                          editingGrade.subjectId === c.id)) && (
                        <div className="space-y-1 mt-1 p-2 bg-white/5 rounded-sm">
                          <div className="text-[10px] font-heading uppercase tracking-wider text-text-muted">
                            {editingGrade ? 'Edit grade' : 'New grade'}
                          </div>
                          <div className="flex gap-1">
                            <input
                              className="input text-xs"
                              inputMode="decimal"
                              placeholder={
                                gradeMode === 'ib' ? 'Grade (1–7)' : 'Grade (0–100)'
                              }
                              value={gradeValue}
                              onChange={(e) => setGradeValue(e.target.value)}
                              autoFocus
                            />
                            <input
                              className="input text-xs"
                              inputMode="decimal"
                              placeholder="Weight"
                              value={gradeWeight}
                              onChange={(e) => setGradeWeight(e.target.value)}
                            />
                          </div>
                          <input
                            className="input text-xs"
                            type="date"
                            value={gradeDate}
                            onChange={(e) => setGradeDate(e.target.value)}
                          />
                          <div className="flex gap-1">
                            <button className="btn text-xs flex-1" onClick={saveGrade}>
                              {editingGrade ? 'Save' : 'Add'}
                            </button>
                            <button
                              className="btn-ghost text-xs flex-1"
                              onClick={cancelGrade}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {courses.length > 0 && (
            <div className="text-[10px] text-text-muted mt-2">
              Credits-weighted · {courses.length} courses · {grades.length} grades
            </div>
          )}
        </div>

        {/* v1.2 — Archived semesters section. StudyDesk owns the archived_at
            column on subjects; archived courses come in via realtime sync and
            land in archivedCourses (separate slice from courses). Toggle is
            closed by default to keep the screen quiet for users who don't
            archive. */}
        {archivedCourses.length > 0 && (
          <div className="glass rounded-xl p-3">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="w-full flex items-center justify-between press-spring"
              aria-expanded={showArchived}
            >
              <span className="font-heading font-semibold text-sm flex items-center gap-2">
                <span aria-hidden>📦</span> Archived semesters
                <span className="text-[10px] text-text-muted">
                  ({archivedCourses.length})
                </span>
              </span>
              <span
                aria-hidden
                className={`text-text-muted text-xs transition-transform duration-200 ease-spring-soft ${
                  showArchived ? 'rotate-180' : ''
                }`}
              >
                ▼
              </span>
            </button>
            {showArchived && (
              <div className="space-y-3 mt-3 stagger-children">
                {archivedBySemester.map((g) => (
                  <div key={g.semester} className="space-y-1.5">
                    <div className="sec">{g.semester}</div>
                    {g.courses.map((c) => {
                      const subjectGrades = gradesBySubject.get(c.id) ?? [];
                      const score = subjectScore(subjectGrades);
                      const dotStyle = c.color ? { backgroundColor: c.color } : undefined;
                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-2 py-1.5 opacity-75"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.color ? '' : 'bg-text-muted/60'}`}
                            style={dotStyle}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate text-text">{c.name}</div>
                            {c.archivedAt && (
                              <div className="text-[10px] text-text-muted">
                                Archived {c.archivedAt.slice(0, 10)}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-text-muted whitespace-nowrap">
                            {score == null
                              ? '—'
                              : gradeMode === 'ib'
                                ? `${score.toFixed(1)}/7`
                                : `${gradeToLetter(score)}`}{' '}
                            ({c.credits} cr)
                          </span>
                          <button
                            type="button"
                            onClick={() => restoreCourse(c.id)}
                            className="pill pill-on press-spring"
                          >
                            Restore
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="text-[10px] text-text-muted">
                  Archived courses don't count toward GPA. Restore syncs back to StudyDesk.
                </div>
              </div>
            )}
          </div>
        )}

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
