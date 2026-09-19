/**
 * The meter face — Rack's signature element, and the one real build the theme
 * needs. Everything else in Rack is a token re-point.
 *
 * The point of it: a budget at 91% is *visibly in the red zone* rather than
 * merely coloured red. The limit is printed on the scale, so approaching it is
 * something you watch happen instead of something you are told about after the
 * fact. That is why the red zone is drawn on the cream face and never on the
 * faceplate — a status colour sitting directly on metal is what would make
 * this read as a skin instead of a machine.
 *
 * Renders nothing under the free theme. NCC's v1.10 instrument look has its
 * own `.bar` primitive and must ship unchanged, so callers gate on the active
 * theme rather than this component silently restyling itself.
 */

export type PeakTone = 'over' | 'ok' | 'new';

export interface MeterProps {
  /** Current reading, in the same units as `max`. */
  value: number;
  max: number;
  /** Where the printed red zone starts, as a percentage of `max`. */
  redZoneFrom?: number;
  /** Comparison peak (last week / last month), as a value not a percentage. */
  peak?: number;
  /**
   * What the peak means here. `over` — this reading is below a peak it should
   * have beaten. `ok` — comfortably inside. `new` — this reading IS the peak,
   * so fill and tick coincide and the mark goes to the needle colour.
   */
  peakTone?: PeakTone;
  /** Print `0 25 50 75 90 100` across the top. 3U meters only. */
  showScale?: boolean;
  /** 5px (bank), 11px (primary), 14px (channel row). */
  height?: 5 | 11 | 14;
  /** Accessible description; the meter is never the only representation. */
  label?: string;
  className?: string;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export function Meter({
  value,
  max,
  redZoneFrom,
  peak,
  peakTone = 'over',
  showScale = false,
  height = 11,
  label,
  className = '',
}: MeterProps) {
  // A zero or missing max would otherwise divide to Infinity and produce a
  // fill of `Infinity%`, which renders as a full bar and reads as "at limit" —
  // the most misleading possible failure for a meter.
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const pct = clampPct((Number.isFinite(value) ? value : 0) / safeMax * 100);
  const peakPct = peak != null && Number.isFinite(peak) ? clampPct((peak / safeMax) * 100) : null;
  const over = redZoneFrom != null && pct >= redZoneFrom;

  return (
    <div className={className}>
      {showScale && (
        <div className="meter-scale mb-1" aria-hidden="true">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>90</span>
          <span>100</span>
        </div>
      )}
      <div
        className="meter"
        style={{ height: `${height}px` }}
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(safeMax)}
        aria-label={label}
      >
        <div className="meter__track" />
        {redZoneFrom != null && (
          <div
            className="meter__zone"
            style={{ insetInlineStart: `${redZoneFrom}%`, width: `${100 - redZoneFrom}%` }}
          />
        )}
        <div className={`meter__fill${over ? ' meter__fill--over' : ''}`} style={{ width: `${pct}%` }} />
        {peakPct != null && (
          <div
            className={`meter__peak meter__peak--${peakTone}`}
            style={{ insetInlineStart: `calc(${peakPct}% - 1px)` }}
          />
        )}
      </div>
    </div>
  );
}

export default Meter;
