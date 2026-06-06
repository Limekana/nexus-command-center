import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import { Pill } from '../../components/ui/Pill';
import { useStudiesStore } from '../../store/useStudiesStore';
import type { ReadingStatus, ReadingShelf } from '../../types/studies';
import { scheduleBorrowReturnReminder, cancelBorrowReturnReminder } from '../../lib/libraryReminders';

const STATUS_OPTIONS: { key: ReadingStatus; label: string }[] = [
  { key: 'to_read', label: 'To-read' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
  { key: 'abandoned', label: 'Abandoned' },
];

const SHELF_OPTIONS: { key: ReadingShelf; label: string; hint: string }[] = [
  { key: 'owned',    label: 'Owned',    hint: 'On your shelf' },
  { key: 'borrowed', label: 'Borrowed', hint: 'From a library or someone else' },
  { key: 'wishlist', label: 'Wishlist', hint: 'Want to own' },
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
  const [shelf, setShelf] = useState<ReadingShelf>('owned');
  const [series, setSeries] = useState('');
  const [seriesNumber, setSeriesNumber] = useState('');
  const [borrowedFrom, setBorrowedFrom] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
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
    setShelf(r.shelf ?? 'owned');
    setSeries(r.series ?? '');
    setSeriesNumber(r.seriesNumber != null ? String(r.seriesNumber) : '');
    setBorrowedFrom(r.borrowedFrom ?? '');
    setExpectedReturnAt(r.expectedReturnAt ? r.expectedReturnAt.slice(0, 10) : '');
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
    const seriesNum = seriesNumber ? parseFloat(seriesNumber) : undefined;
    const payload = {
      title: title.trim(),
      author: author.trim() || undefined,
      status,
      shelf,
      series: series.trim() || undefined,
      seriesNumber: seriesNum,
      totalPages: totalNum,
      pagesRead: readNum,
      rating: rating ?? undefined,
      subjectId: subjectId || undefined,
      notes: notes.trim() || undefined,
      // Borrow metadata only carried when on the Borrowed shelf — store
      // stays consistent with setReadingShelf's contract.
      borrowedFrom: shelf === 'borrowed' ? (borrowedFrom.trim() || undefined) : undefined,
      expectedReturnAt: shelf === 'borrowed' ? (expectedReturnAt || undefined) : undefined,
    };
    let savedId = editId;
    if (editId) {
      await updateReading(editId, payload);
    } else {
      const now = new Date().toISOString();
      savedId = crypto.randomUUID();
      await addReading({
        ...payload,
        startedAt: status === 'reading' || status === 'finished' ? now : undefined,
        finishedAt: status === 'finished' ? now : undefined,
        // Stamp borrowedAt on creation too if directly adding a borrowed book.
        borrowedAt: shelf === 'borrowed' ? now : undefined,
      });
    }

    // Reminder side-effect: schedule for borrowed books with a return date,
    // cancel for anything else. Matches setReadingShelf's behavior on edits.
    if (savedId) {
      const reading = {
        id: savedId,
        title: payload.title,
        shelf,
        borrowedFrom: payload.borrowedFrom,
        expectedReturnAt: payload.expectedReturnAt,
      } as Parameters<typeof scheduleBorrowReturnReminder>[0];
      if (shelf === 'borrowed' && payload.expectedReturnAt) {
        void scheduleBorrowReturnReminder(reading);
      } else {
        void cancelBorrowReturnReminder({ id: savedId });
      }
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

  // On wishlist, status defaults to to_read implicitly — collapse the status
  // selector to avoid clutter (a book you don't own yet is by definition
  // not being read). The status row stays for owned + borrowed (you're
  // typically reading a borrowed book during the loan window).
  const showStatusRow = shelf !== 'wishlist';

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
          <div className="sec mb-2">Shelf</div>
          <div className="flex gap-2 flex-wrap">
            {SHELF_OPTIONS.map((s) => (
              <Pill
                key={s.key}
                on={shelf === s.key}
                onClick={() => setShelf(s.key)}
              >
                {s.label}
              </Pill>
            ))}
          </div>
          <div className="text-[10px] text-text-muted mt-1.5">
            {SHELF_OPTIONS.find((s) => s.key === shelf)?.hint}
          </div>
        </div>

        {shelf === 'borrowed' && (
          <div className="glass rounded-xl p-3 space-y-2 animate-fade-in-up">
            <div className="sec">Borrow details</div>
            <input
              className="input"
              placeholder="Borrowed from (e.g. Oslo Public Library)"
              value={borrowedFrom}
              onChange={(e) => setBorrowedFrom(e.target.value)}
            />
            <div>
              <div className="text-[10px] text-text-muted mb-1">Due back (optional)</div>
              <input
                type="date"
                className="input"
                value={expectedReturnAt}
                onChange={(e) => setExpectedReturnAt(e.target.value)}
              />
              <div className="text-[10px] text-text-muted mt-1">
                If set, you'll get a 9 AM reminder on that day to return the book.
              </div>
            </div>
          </div>
        )}

        {showStatusRow && (
          <div>
            <div className="sec mb-2">Status</div>
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <Pill
                  key={s.key}
                  on={status === s.key}
                  onClick={() => setStatus(s.key)}
                >
                  {s.label}
                </Pill>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="sec mb-2">Series (optional)</div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Series name"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
            />
            <input
              className="input w-20"
              inputMode="decimal"
              placeholder="#"
              value={seriesNumber}
              onChange={(e) => setSeriesNumber(e.target.value)}
            />
          </div>
        </div>

        {shelf !== 'wishlist' && (
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
        )}

        {(status === 'finished' || status === 'abandoned') && shelf !== 'wishlist' && (
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
