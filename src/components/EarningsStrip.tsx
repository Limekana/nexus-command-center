// Upcoming earnings for held tickers. Filters to events from today forward,
// up to ~60 days. Hidden when no held ticker has anything scheduled in the
// window (which is the case for most ETFs and international stocks where
// Finnhub free returns nothing).
//
// Each row: ticker · "Reports Thu" / "in 4 days" / "today" · hour code.
// Tapping a row opens the holding detail sheet (parent owns that state).

import type { EarningsEvent } from '../api/stockDetail';

interface Props {
  events: EarningsEvent[];
  onTapTicker?: (ticker: string) => void;
}

function daysUntil(dateStr: string): number {
  // Local midnight basis so "today" is 0, "tomorrow" is 1, regardless of TZ.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function relativeLabel(dateStr: string): string {
  const d = daysUntil(dateStr);
  if (d < 0) return `${-d}d ago`;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d <= 7) {
    const weekday = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    return weekday;
  }
  return `in ${d} days`;
}

function hourLabel(hour?: string): string {
  if (hour === 'bmo') return 'Pre-market';
  if (hour === 'amc') return 'After close';
  if (hour === 'dmh') return 'During hours';
  return '';
}

export default function EarningsStrip({ events, onTapTicker }: Props) {
  // Only events from today forward; sort by date asc. Limit to 5 most-imminent.
  const upcoming = events
    .filter((e) => daysUntil(e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  if (upcoming.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading font-semibold text-sm">Earnings Calendar</span>
        <span className="text-[9px] uppercase tracking-wider text-text-muted">
          Next {upcoming.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {upcoming.map((e) => {
          const d = daysUntil(e.date);
          const imminent = d <= 2;
          return (
            <button
              key={`${e.symbol}-${e.date}`}
              onClick={() => onTapTicker?.(e.symbol)}
              className="w-full flex items-center justify-between py-1.5 px-1 rounded-sm active:bg-surface2/50 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium">{e.symbol}</span>
                {e.hour && (
                  <span className="text-[9px] uppercase tracking-wider text-text-muted">
                    {hourLabel(e.hour)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-text-muted">{e.date}</span>
                <span className={`font-medium ${imminent ? 'text-primary' : 'text-text'}`}>
                  {relativeLabel(e.date)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
