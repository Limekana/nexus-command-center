// GitHub-style year heatmap. One cell per day, columns are weeks, rows are
// weekdays (Sun at top). Used across modules to surface streaks/dry spells
// in a way line charts can't.
//
// Consumer passes a Map<YYYY-MM-DD, number> (use localDateKey from the
// store to build it — same format used everywhere else). We bucket values
// into 4 intensity levels automatically based on the max in the visible
// window, so the same component visualises 0–3 workouts/day OR 0–10
// transactions/day without manual config.
//
// On a phone the 53-week grid is wider than the viewport — we wrap in an
// overflow-x-auto container so it scrolls horizontally. A small "legend"
// row below explains the colour scale and shows the visible total.

import { useEffect, useMemo, useRef } from 'react';
import { localDateKey } from '../utils/formatters';

export type HeatmapTint = 'primary' | 'success' | 'warning' | 'danger';

interface HeatmapCalendarProps {
  // 'YYYY-MM-DD' → count. Missing keys render as zero.
  data: Map<string, number>;
  // Number of weeks to render, going backwards from today. Default 53 ≈ 1 year.
  weeks?: number;
  // Colour family — pick to match the module (cyan/green/amber/red).
  tint?: HeatmapTint;
  // Label for the legend total ("workouts", "tasks", "€"…). Singular noun;
  // we pluralise naively by appending 's' unless it's a currency symbol.
  unit?: string;
  // Optional override for the upper bound. If omitted we use max(data) in
  // the visible window. Useful when the consumer wants a fixed scale across
  // multiple side-by-side heatmaps.
  maxValue?: number;
}

const TINT_HEX: Record<HeatmapTint, string> = {
  primary: '#00D4FF',
  success: '#3FB950',
  warning: '#D29922',
  danger: '#F85149',
};

// 4 active levels + level 0 (empty). Opacities tuned for the Cyber Slate bg.
// Level 1 starts at 0.28 so the first tier of activity is clearly visible
// against the card surface (was 0.18, which got lost in dim card lighting).
const LEVEL_OPACITY = [0, 0.28, 0.5, 0.75, 1.0];
// Empty-day fill is brighter than surface2 (#1C2128) so the grid stays
// visible even when every cell is zero — otherwise an all-empty heatmap
// blends into the card bg (#161B22) and looks broken.
const EMPTY_FILL = '#262C34';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function HeatmapCalendar({
  data,
  weeks = 53,
  tint = 'primary',
  unit,
  maxValue,
}: HeatmapCalendarProps) {
  const { columns, total, max, monthMarkers } = useMemo(() => {
    // Walk backwards from today aligned to end-of-week (Saturday), so the
    // rightmost column always ends on the most recent Saturday — the same
    // alignment GitHub uses. The current week sits as the rightmost partial.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Find the Saturday on or after today (or today if it IS Saturday).
    const daysUntilSat = (6 - today.getDay() + 7) % 7;
    const lastDay = new Date(today);
    lastDay.setDate(today.getDate() + daysUntilSat);

    const cols: Array<Array<{ key: string; value: number; isFuture: boolean; date: Date }>> = [];
    const markers: Array<{ colIndex: number; label: string }> = [];
    let runningTotal = 0;
    let runningMax = 0;
    let lastMonthLabelled = -1;

    for (let w = weeks - 1; w >= 0; w--) {
      const colDays: Array<{ key: string; value: number; isFuture: boolean; date: Date }> = [];
      // Each column: Sunday (row 0) through Saturday (row 6).
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(lastDay);
        cellDate.setDate(lastDay.getDate() - w * 7 - (6 - d));
        const key = localDateKey(cellDate);
        const value = data.get(key) ?? 0;
        const isFuture = cellDate.getTime() > today.getTime();
        if (!isFuture) {
          runningTotal += value;
          if (value > runningMax) runningMax = value;
        }
        colDays.push({ key, value, isFuture, date: cellDate });
      }
      // Label this column with its month name if the month changed since the
      // last label. We use the first day of the column as the anchor.
      const firstOfCol = colDays[0].date;
      const monthOfCol = firstOfCol.getMonth();
      if (monthOfCol !== lastMonthLabelled && firstOfCol.getDate() <= 7) {
        markers.push({ colIndex: cols.length, label: MONTH_LABELS[monthOfCol] });
        lastMonthLabelled = monthOfCol;
      }
      cols.push(colDays);
    }

    return {
      columns: cols,
      total: runningTotal,
      max: maxValue ?? runningMax,
      monthMarkers: markers,
    };
  }, [data, weeks, maxValue]);

  const hex = TINT_HEX[tint];

  const levelFor = (value: number): number => {
    if (value <= 0 || max <= 0) return 0;
    // Quartile bucketing: split the range (0, max] into 4 levels.
    const ratio = value / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  const formatTotal = (n: number): string => {
    if (unit === '€' || unit === '$' || unit === '£') {
      return `${unit}${n.toLocaleString('fi-FI', { maximumFractionDigits: 0 })}`;
    }
    const noun = unit ? `${unit}${n === 1 ? '' : 's'}` : '';
    return `${n.toLocaleString('fi-FI')} ${noun}`.trim();
  };

  // Cell size keeps the whole 53-week grid roughly 700px wide — wider than
  // a phone, so the parent provides horizontal scroll. Touch users get to
  // drag through their year, same as GitHub mobile does.
  const CELL = 11;
  const GAP = 2;
  const colW = CELL + GAP;

  // v1.3.1 BUG-11 — initialize scrolled to the rightmost (most-recent) end.
  // The 53-week grid runs oldest→newest left-to-right; without this nudge
  // every cold mount lands the user looking at last December instead of
  // today. Browsers clamp scrollLeft to the max automatically so we don't
  // need to compute the exact target.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [columns.length]);

  return (
    <div className="w-full">
      <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1">
        <div style={{ width: columns.length * colW }}>
          {/* Month markers row */}
          <div className="relative h-3 mb-0.5" style={{ width: columns.length * colW }}>
            {monthMarkers.map((m) => (
              <span
                key={`${m.colIndex}-${m.label}`}
                className="absolute text-[9px] uppercase tracking-wider text-text-muted/70"
                style={{ left: m.colIndex * colW }}
              >
                {m.label}
              </span>
            ))}
          </div>
          {/* Grid */}
          <svg
            width={columns.length * colW}
            height={7 * colW}
            shapeRendering="crispEdges"
            aria-label="Activity heatmap"
          >
            {columns.map((col, ci) =>
              col.map((cell, ri) => {
                const level = cell.isFuture ? 0 : levelFor(cell.value);
                const fill =
                  level === 0
                    ? cell.isFuture
                      ? 'transparent'
                      : EMPTY_FILL
                    : hex;
                return (
                  <rect
                    key={cell.key}
                    x={ci * colW}
                    y={ri * colW}
                    width={CELL}
                    height={CELL}
                    rx={2}
                    ry={2}
                    fill={fill}
                    fillOpacity={level === 0 ? 1 : LEVEL_OPACITY[level]}
                    stroke={cell.isFuture ? 'transparent' : '#30363D'}
                    strokeOpacity={0.4}
                    strokeWidth={0.5}
                  >
                    <title>
                      {cell.key}: {cell.value}
                      {unit ? ` ${unit}${cell.value === 1 ? '' : 's'}` : ''}
                    </title>
                  </rect>
                );
              }),
            )}
          </svg>
        </div>
      </div>
      {/* Legend */}
      <div className="flex items-center justify-between mt-2 text-[9px] uppercase tracking-wider text-text-muted">
        <span>{formatTotal(total)} last {weeks}w</span>
        <div className="flex items-center gap-1">
          <span>Less</span>
          {[1, 2, 3, 4].map((lv) => (
            <span
              key={lv}
              className="inline-block rounded-sm"
              style={{
                width: 8,
                height: 8,
                backgroundColor: hex,
                opacity: LEVEL_OPACITY[lv],
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
