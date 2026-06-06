import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import BottomSheet from '../../components/BottomSheet';
import { Pill } from '../../components/ui/Pill';
import { useStudiesStore } from '../../store/useStudiesStore';
import type { Reading, ReadingShelf, ReadingStatus } from '../../types/studies';

/**
 * v1.2 Library — three shelves (Owned, Borrowed, Wishlist) layered with a
 * status sub-filter and a sort selector. Sort by Series produces a grouped
 * view with section headers + book numbers per series.
 *
 * v1.2.2 — shelf "Lent" (lend YOUR book to a friend) was the inverted
 * reading of the v1.2 status-file scope, which called for "Borrowed FROM a
 * library, due back by X". Renamed shelf literal + UI copy + reminder
 * semantic; Dexie v10 maps existing rows. Functionally identical pipeline,
 * inverted noun: who's holding the book and who's it owed to.
 *
 * Design choices:
 *   - Top filter row = shelf state. Most users land here knowing "I want to
 *     see what I own" or "what library books are out and need returning".
 *     This is the dominant axis.
 *   - Status (to_read / reading / finished / abandoned) is secondary and only
 *     shown when meaningful (e.g. Wishlist collapses it — wishlist items are
 *     all implicitly to_read).
 *   - Sort pill on the right opens a small sheet. Series sort restructures
 *     the list into grouped sections — that's the one sort with visual impact
 *     beyond reordering.
 *   - Borrowed rows surface borrowed-from + due-back in a glass info strip
 *     below the title. Quick "Returned" action removes the book from the
 *     library (you don't own it, so once returned it shouldn't sit on a
 *     shelf at all — confirmation prompt protects against misclicks).
 */

const SHELVES: { key: ReadingShelf | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'Owned' },
  { key: 'borrowed', label: 'Borrowed' },
  { key: 'wishlist', label: 'Wishlist' },
];

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
  to_read: 'text-text-muted border-glass-border',
  reading: 'text-primary border-primary/45',
  finished: 'text-success border-success/45',
  abandoned: 'text-text-muted/60 border-glass-border',
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

type SortKey = 'title' | 'author' | 'series' | 'rating' | 'created' | 'status';

const SORT_OPTIONS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'title',   label: 'Title (A→Z)',     hint: 'Alphabetical by title' },
  { key: 'author',  label: 'Author (A→Z)',    hint: 'Alphabetical by last name' },
  { key: 'series',  label: 'Series',          hint: 'Grouped, numbered by book' },
  { key: 'rating',  label: 'Rating ★',        hint: 'Highest rated first' },
  { key: 'created', label: 'Recently added',  hint: 'Newest first' },
  { key: 'status',  label: 'Read status',     hint: 'Reading → To-read → Finished → Abandoned' },
];

// Derive a sortable last-name string. Anything after the last space is the
// last name; falls back to the full author string if no space.
function lastName(author: string | undefined): string {
  if (!author) return '~'; // sort missing authors to the end
  const trimmed = author.trim();
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

const STATUS_ORDER: Record<ReadingStatus, number> = {
  reading: 0,
  to_read: 1,
  finished: 2,
  abandoned: 3,
};

export default function Library() {
  const navigate = useNavigate();
  const readings = useStudiesStore((s) => s.readings);
  const setReadingStatus = useStudiesStore((s) => s.setReadingStatus);
  const deleteReading = useStudiesStore((s) => s.deleteReading);

  const [shelfFilter, setShelfFilter] = useState<ReadingShelf | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('title');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  // ─── Filter ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return readings.filter((r) => {
      const shelf = r.shelf ?? 'owned';
      if (shelfFilter !== 'all' && shelf !== shelfFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [readings, shelfFilter, statusFilter]);

  // ─── Sort ──────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case 'title':
        arr.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'author':
        arr.sort((a, b) => lastName(a.author).localeCompare(lastName(b.author)));
        break;
      case 'rating':
        arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title));
        break;
      case 'created':
        arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case 'status':
        arr.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title));
        break;
      case 'series':
        arr.sort((a, b) => {
          const sa = (a.series ?? '~').toLowerCase();
          const sb = (b.series ?? '~').toLowerCase();
          if (sa !== sb) return sa.localeCompare(sb);
          // Same series → order by book number, then title.
          const na = a.seriesNumber ?? Infinity;
          const nb = b.seriesNumber ?? Infinity;
          if (na !== nb) return na - nb;
          return a.title.localeCompare(b.title);
        });
        break;
    }
    return arr;
  }, [filtered, sort]);

  // ─── Series grouping (only when sort = series) ────────────────────────
  const grouped = useMemo(() => {
    if (sort !== 'series') return null;
    const groups: { key: string; label: string; books: Reading[] }[] = [];
    for (const r of sorted) {
      const key = r.series ?? '__none__';
      const label = r.series ?? 'Standalone';
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.books.push(r);
      else groups.push({ key, label, books: [r] });
    }
    return groups;
  }, [sorted, sort]);

  // ─── Counts per shelf for badge display ───────────────────────────────
  const shelfCounts = useMemo(() => {
    const c: Record<string, number> = { all: readings.length };
    for (const s of ['owned', 'borrowed', 'wishlist'] as ReadingShelf[]) {
      c[s] = readings.filter((r) => (r.shelf ?? 'owned') === s).length;
    }
    return c;
  }, [readings]);

  // ─── Empty state copy ──────────────────────────────────────────────────
  let emptyCopy: string;
  if (readings.length === 0) {
    emptyCopy = 'No books logged yet — tap + Book to add one.';
  } else if (filtered.length === 0) {
    const shelfLabel = SHELVES.find((s) => s.key === shelfFilter)?.label ?? 'this shelf';
    const statusLabel = statusFilter === 'all' ? '' : ` · ${STATUSES.find((s) => s.key === statusFilter)?.label}`;
    emptyCopy = `Nothing in ${shelfLabel}${statusLabel}.`;
  } else {
    emptyCopy = '';
  }

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
            className="pill pill-on pill-lg press-spring"
            type="button"
          >
            + Book
          </button>
        }
      />
      <div className="space-y-3">
        {/* ─── Shelf row (primary filter) ───────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {SHELVES.map((s) => (
            <Pill
              key={s.key}
              on={shelfFilter === s.key}
              onClick={() => setShelfFilter(s.key)}
              className="flex-shrink-0"
            >
              {s.label} <span className="opacity-60">{shelfCounts[s.key] ?? 0}</span>
            </Pill>
          ))}
        </div>

        {/* ─── Toolbar — status filter + sort ─────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {STATUSES.map((s) => (
            <Pill
              key={s.key}
              size="sm"
              on={statusFilter === s.key}
              onClick={() => setStatusFilter(s.key)}
              className="flex-shrink-0"
            >
              {s.label}
            </Pill>
          ))}
          <div className="ml-auto flex-shrink-0">
            <Pill size="sm" onClick={() => setSortSheetOpen(true)} icon="↕" className="text-text">
              {SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Sort'}
            </Pill>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center">
            <div className="text-xs text-text-muted">{emptyCopy}</div>
          </div>
        ) : grouped ? (
          // Series-grouped view — section headers above each group.
          <div className="space-y-4 stagger-children">
            {grouped.map((g) => (
              <div key={g.key} className="space-y-2">
                <div className="flex items-baseline justify-between px-1">
                  <div className="font-heading font-semibold text-sm tracking-tight">
                    {g.label}
                  </div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">
                    {g.books.length} book{g.books.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="space-y-2">
                  {g.books.map((r) => (
                    <BookRow
                      key={r.id}
                      reading={r}
                      showSeriesNumber
                      onCycleStatus={() => setReadingStatus(r.id, NEXT_STATUS[r.status])}
                      onReturned={() => {
                        // v1.2.2 — borrowed-from-library books are returned to
                        // the library, not added to your shelf. Confirm + delete.
                        if (confirm(`Mark "${r.title}" as returned and remove from library?`)) {
                          void deleteReading(r.id);
                        }
                      }}
                      onDelete={() => deleteReading(r.id)}
                      onEdit={() => navigate(`/studies/library/add?id=${r.id}`)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat list view — first 8 children stagger in.
          <div className="space-y-2 stagger-children">
            {sorted.map((r) => (
              <BookRow
                key={r.id}
                reading={r}
                onCycleStatus={() => setReadingStatus(r.id, NEXT_STATUS[r.status])}
                onReturned={() => {
                  // v1.2.2 — borrowed-from-library books are returned to the
                  // library, not added to your shelf. Confirm + delete.
                  if (confirm(`Mark "${r.title}" as returned and remove from library?`)) {
                    void deleteReading(r.id);
                  }
                }}
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

      {/* ─── Sort sheet ──────────────────────────────────────────────── */}
      <BottomSheet
        open={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        title="Sort by"
      >
        <div className="space-y-1.5">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setSort(o.key);
                setSortSheetOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-left press-spring ${
                sort === o.key
                  ? 'glass-glow text-primary'
                  : 'glass text-text'
              }`}
            >
              <div>
                <div className="font-heading font-semibold text-sm">{o.label}</div>
                <div className="text-[10px] text-text-muted mt-0.5">{o.hint}</div>
              </div>
              {sort === o.key && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

interface BookRowProps {
  reading: Reading;
  showSeriesNumber?: boolean;
  onCycleStatus: () => void;
  onReturned: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

function BookRow({ reading: r, showSeriesNumber, onCycleStatus, onReturned, onDelete, onEdit }: BookRowProps) {
  const shelf = r.shelf ?? 'owned';
  // Progress percentage shown only when both numbers are present and sane.
  const progress =
    r.totalPages != null && r.pagesRead != null && r.totalPages > 0
      ? Math.min(100, Math.round((r.pagesRead / r.totalPages) * 100))
      : null;

  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-start gap-2">
        {showSeriesNumber && r.seriesNumber != null && (
          <div
            aria-hidden
            className="flex-shrink-0 w-7 h-7 rounded-pill flex items-center justify-center text-[10px] font-heading font-bold text-primary border border-primary/45"
            style={{ background: 'rgba(0, 212, 255, 0.08)' }}
          >
            {r.seriesNumber}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold text-sm truncate">{r.title}</div>
          {r.author && (
            <div className="text-[11px] text-text-muted truncate">{r.author}</div>
          )}
        </div>
        <button
          onClick={onCycleStatus}
          className={`text-[9px] uppercase tracking-wider rounded-pill border px-2 py-0.5 flex-shrink-0 press-spring ${STATUS_TONE[r.status]}`}
          style={{ background: 'rgba(28, 33, 40, 0.38)' }}
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

      {/* Borrowed strip — appears below the title row when shelf=borrowed.
          Glass-soft inset, warning tone so off-shelf books stand out. v1.2.2
          renamed from Lent; "Returned" removes the book entirely (you don't
          own it — once it's back at the library it shouldn't sit on a shelf). */}
      {shelf === 'borrowed' && (
        <div className="mt-2 glass-soft rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex-1 min-w-0 text-warning truncate">
            {r.borrowedFrom ? `From ${r.borrowedFrom}` : 'Borrowed'}
            {r.expectedReturnAt && (
              <span className="text-text-muted"> · due {r.expectedReturnAt.slice(0, 10)}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onReturned}
            className="pill pill-success flex-shrink-0"
          >
            Returned
          </button>
        </div>
      )}

      {/* Wishlist strip — soft cyan accent reminder that this is aspirational. */}
      {shelf === 'wishlist' && (
        <div className="mt-2 text-[11px] text-primary/80 italic">
          Wishlist · not on shelf yet
        </div>
      )}

      {progress != null && shelf !== 'wishlist' && (
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
