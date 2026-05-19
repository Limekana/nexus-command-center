import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import { useStudiesStore } from '../../store/useStudiesStore';
import type { ReadingStatus } from '../../types/studies';

const STATUS_OPTIONS: { key: ReadingStatus; label: string }[] = [
  { key: 'to_read', label: 'To-read' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
  { key: 'abandoned', label: 'Abandoned' },
];

export default function AddReading() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');

  const readings = useStudiesStore((s) => s.readings);
  const courses = useStudiesStore((s) => s.courses);
  const addReading = useStudiesStore((s) => s.addReading);
  const updateReading = useStudiesStore((s) => s.updateReading);
  const deleteReading = useStudiesStore((s) => s.deleteReading);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<ReadingStatus>('reading');
  const [totalPages, setTotalPages] = useState('');
  const [pagesRead, setPagesRead] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    const r = readings.find((x) => x.id === editId);
    if (!r) return;
    setTitle(r.title);
    setAuthor(r.author ?? '');
    setStatus(r.status);
    setTotalPages(r.totalPages != null ? String(r.totalPages) : '');
    setPagesRead(r.pagesRead != null ? String(r.pagesRead) : '');
    setRating(r.rating ?? null);
    setSubjectId(r.subjectId ?? '');
    setNotes(r.notes ?? '');
  }, [editId, readings]);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const totalNum = totalPages ? parseInt(totalPages) : undefined;
    const readNum = pagesRead ? parseInt(pagesRead) : undefined;
    const payload = {
      title: title.trim(),
      author: author.trim() || undefined,
      status,
      totalPages: totalNum,
      pagesRead: readNum,
      rating: rating ?? undefined,
      subjectId: subjectId || undefined,
      notes: notes.trim() || undefined,
      // The store's setReadingStatus auto-stamps started/finished — but on
      // the add screen we let the user enter status directly without that
      // side-effect. On a NEW entry we stamp here so timestamps still get
      // populated; on edit we leave them as the user set them previously.
    };
    if (editId) {
      await updateReading(editId, payload);
    } else {
      const now = new Date().toISOString();
      await addReading({
        ...payload,
        startedAt: status === 'reading' || status === 'finished' ? now : undefined,
        finishedAt: status === 'finished' ? now : undefined,
      });
    }
    setSaving(false);
    navigate('/studies/library');
  };

  const onDelete = async () => {
    if (!editId) return;
    if (!confirm(`Remove "${title}" from your library?`)) return;
    await deleteReading(editId);
    navigate('/studies/library');
  };

  return (
    <>
      <AppHeader
        title={editId ? 'Edit Book' : 'Add Book'}
        back="/studies/library"
        backLabel="Library"
        showAvatar={false}
      />
      <div className="space-y-3">
        <div>
          <div className="sec mb-2">Title</div>
          <input
            className="input"
            placeholder="Book title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <div className="sec mb-2">Author</div>
          <input
            className="input"
            placeholder="Author (optional)"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </div>

        <div>
          <div className="sec mb-2">Status</div>
          <div className="flex gap-2 flex-wrap">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setStatus(s.key)}
                className={`chip ${status === s.key ? 'chip-on' : ''}`}
                type="button"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="sec mb-2">Pages (optional)</div>
          <div className="flex gap-2">
            <input
              className="input"
              inputMode="numeric"
              placeholder="Read"
              value={pagesRead}
              onChange={(e) => setPagesRead(e.target.value)}
            />
            <input
              className="input"
              inputMode="numeric"
              placeholder="Total"
              value={totalPages}
              onChange={(e) => setTotalPages(e.target.value)}
            />
          </div>
        </div>

        {(status === 'finished' || status === 'abandoned') && (
          <div>
            <div className="sec mb-2">Rating (optional)</div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(rating === n ? null : n)}
                  className={`chip flex-1 ${rating != null && n <= rating ? 'chip-on' : ''}`}
                  type="button"
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="sec mb-2">Linked subject (optional)</div>
          <select
            className="input"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">None — personal reading</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="text-[10px] text-text-muted mt-1">
            Use this for textbooks or assigned reading tied to a course.
          </div>
        </div>

        <div>
          <div className="sec mb-2">Notes</div>
          <textarea
            className="input min-h-[80px]"
            placeholder="Thoughts, quotes, takeaways…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button
          className="btn w-full"
          onClick={submit}
          disabled={saving || !title.trim()}
        >
          {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add to Library'}
        </button>
        {editId && (
          <button
            className="btn-ghost w-full text-danger border-danger/40"
            onClick={onDelete}
          >
            Remove Book
          </button>
        )}
        <div className="text-[10px] text-text-muted text-center">
          Queued locally · syncs when online
        </div>
      </div>
    </>
  );
}
