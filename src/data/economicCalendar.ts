// Economic calendar — v1.4 Markets segment.
//
// Hardcoded macro-event schedule. The Markets tab shows the next few upcoming
// events with a days-until countdown badge. No network call — these dates are
// published a year+ in advance by the ECB / Fed / Eurostat / BLS.
//
// SOURCES (verify against the official calendars when extending into 2027):
//   ECB GC monetary policy meetings:
//     https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
//   FOMC meetings:
//     https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
//   US NFP (BLS Employment Situation): first Friday of the month (mostly)
//   EU CPI flash (Eurostat HICP flash estimate): ~1st of the following month
//
// Dates below cover H2 2026. They are scheduled decision/release days and may
// shift slightly — the countdown UI degrades gracefully either way.

export type CalendarEventType = 'ecb' | 'fomc' | 'cpi' | 'nfp' | 'gdp';
export type CalendarRegion = 'EU' | 'US';

export interface CalendarEvent {
  date: string; // 'YYYY-MM-DD'
  label: string;
  type: CalendarEventType;
  region: CalendarRegion;
}

export const ECONOMIC_CALENDAR: CalendarEvent[] = [
  { date: '2026-07-01', label: 'EU CPI Flash Est.', type: 'cpi', region: 'EU' },
  { date: '2026-07-03', label: 'US NFP Release', type: 'nfp', region: 'US' },
  { date: '2026-07-29', label: 'FOMC Decision', type: 'fomc', region: 'US' },
  { date: '2026-07-30', label: 'ECB Meeting', type: 'ecb', region: 'EU' },
  { date: '2026-08-07', label: 'US NFP Release', type: 'nfp', region: 'US' },
  { date: '2026-09-01', label: 'EU CPI Flash Est.', type: 'cpi', region: 'EU' },
  { date: '2026-09-04', label: 'US NFP Release', type: 'nfp', region: 'US' },
  { date: '2026-09-10', label: 'ECB Meeting', type: 'ecb', region: 'EU' },
  { date: '2026-09-16', label: 'FOMC Decision', type: 'fomc', region: 'US' },
  { date: '2026-10-02', label: 'US NFP Release', type: 'nfp', region: 'US' },
  { date: '2026-10-28', label: 'FOMC Decision', type: 'fomc', region: 'US' },
  { date: '2026-10-29', label: 'ECB Meeting', type: 'ecb', region: 'EU' },
  { date: '2026-11-06', label: 'US NFP Release', type: 'nfp', region: 'US' },
  { date: '2026-12-04', label: 'US NFP Release', type: 'nfp', region: 'US' },
  { date: '2026-12-09', label: 'FOMC Decision', type: 'fomc', region: 'US' },
  { date: '2026-12-17', label: 'ECB Meeting', type: 'ecb', region: 'EU' },
];

export interface UpcomingEvent extends CalendarEvent {
  /** Whole days from `now` (00:00 local) to the event date. 0 = today. */
  daysUntil: number;
  isToday: boolean;
}

/** Midnight-aligned day delta so "today" is 0 regardless of clock time. */
function dayDelta(fromMs: number, isoDate: string): number {
  const a = new Date(fromMs);
  a.setHours(0, 0, 0, 0);
  const [y, m, d] = isoDate.split('-').map((p) => parseInt(p, 10));
  const b = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * The next `count` events on or after today, soonest first. Past events are
 * dropped. Today's events sort first with `isToday` set.
 */
export function upcomingEvents(count = 5, now: number = Date.now()): UpcomingEvent[] {
  return ECONOMIC_CALENDAR.map((e) => {
    const daysUntil = dayDelta(now, e.date);
    return { ...e, daysUntil, isToday: daysUntil === 0 };
  })
    .filter((e) => e.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, count);
}

export const EVENT_ICONS: Record<CalendarEventType, string> = {
  ecb: '🇪🇺',
  fomc: '🇺🇸',
  cpi: '📊',
  nfp: '💼',
  gdp: '📈',
};
