import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import { useStudiesStore } from '../../store/useStudiesStore';
import type { Reading, ReadingStatus } from '../../types/studies';

// Display order matches reading flow: future → present → past → discarded.
const STATUSES: { key: ReadingStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'to_read', label: 'To-read' },
  { key: 'finished', label: 'Finished' },
  { key: 'abandoned', label: 'Abandoned' },
];

const STATUS_LABEL: Record<ReadingStatus, string> = {
  to_read: 'To-read',
  reading: 'Reading',
  finished: 'Finished',
  abandoned: 'Abandoned',
};

const STATUS_TONE: Record<ReadingStatus, string> = {
  to_read: 'text-text-muted border-border bg-surface',
  reading: 'text-primary border-primary/40 bg-primary/5',
  finished: 'text-success border-success/40 bg-success/5',
  abandoned: 'text-text-muted/60 border-border bg-surface',
};

// Cycle order for the inline status tap: to_read → reading → finished →
// abandoned → to_read. Picked to match the natural progression and let a
// single tap advance a book without needing the full edit screen.
const NEXT_STATUS: Record<ReadingStatus, ReadingStatus> = {
  to_read: 'reading',
  reading: 'finished',
  finished: 'abandoned',
  abandoned: 'to_read',
};

export default function Library() {
  const navigate = useNavigate();
  const readings = useStudiesStore((s) => s.readings);
  const setReadingStatus = useStudiesStore((s) => s.setReadingStatus);
  const deleteReading = useStudiesStore((s) => s.deleteReading);

  const [filter, setFilter] = useState<ReadingStatus | 'all'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return readings;
    return readings.filter((r) => r.status === filter);
  }, [readings, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: readings.length };
    for (const status of ['to_read', 'reading', 'finished', 'abandoned'] as ReadingStatus[]) {
      c[status] = readings.filter((r) => r.status === status).length;
    }
    return c;
  }, [readings]);

  return (
    <>
      <AppHeader
        title="Library"
        back="/studies"
        backLabel="Studies"
        showAvatar={false}
        action={
          <button
            onClick={() => navigate('/studies/library/add')}
            className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
          >
            + Book
          </button>
        }
      />
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={`chip flex-shrink-0 ${filter === s.key ? 'chip-on' : ''}`}
            >
              {s.label} <span className="opacity-60">{counts[s.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <div className="text-xs text-text-muted text-center py-6">
              {readings.length === 0
                ? 'No books logged yet — tap + Book to add one.'
                : `No books in "${STATUSES.find((s) => s.key === filter)?.label}".`}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <BookRow
                key={r.id}
                reading={r}
                onCycleStatus={() => setReadingStatus(r.id, NEXT_STATUS[r.status])}
                onDelete={() => deleteReading(r.id)}
                onEdit={() => navigate(`/studies/library/add?id=${r.id}`)}
              />
            ))}
          </div>
        )}

        <div className="text-[10px] text-text-muted text-center">
          Queued locally · syncs when online
        </div>
      </div>
    </>
  );
}

interface BookRowProps {
  reading: Reading;
  onCycleStatus: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

function BookRow({ reading: r, onCycleStatus, onDelete, onEdit }: BookRowProps) {
  // Progress percentage shown only when both numbers are present and sane.
  const progress =
    r.totalPages != null && r.pagesRead != null && r.totalPages > 0
      ? Math.min(100, Math.round((r.pagesRead / r.totalPages) * 100))
      : null;

  return (
    <div className="card">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold text-sm truncate">{r.title}</div>
          {r.author && (
            <div className="text-[11px] text-text-muted truncate">{r.author}</div>
          )}
        </div>
        <button
          onClick={onCycleStatus}
          className={`text-[9px] uppercase tracking-wider rounded-sm border px-1.5 py-0.5 flex-shrink-0 ${STATUS_TONE[r.status]}`}
          type="button"
          aria-label={`Change status from ${STATUS_LABEL[r.status]}`}
        >
          {STATUS_LABEL[r.status]}
        </button>
        <RowActions
          onEdit={onEdit}
          onDelete={onDelete}
          confirmMsg={`Remove "${r.title}" from your library?`}
        />
      </div>

      {progress != null && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
            <div
              className="h-full bg-primary/60"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] text-text-muted mt-1">
            {r.pagesRead}/{r.totalPages} pages · {progress}%
          </div>
        </div>
      )}

      {r.rating != null && (
        <div className="text-xs mt-1 text-warning">
          {'★'.repeat(r.rating)}
          <span className="text-text-muted">{'★'.repeat(5 - r.rating)}</span>
        </div>
      )}

      {r.notes && (
        <div className="text-[11px] text-text-muted mt-1 line-clamp-2">{r.notes}</div>
      )}
    </div>
  );
}
