// v1.15 (Item 13, handoff follow-up #46) — Rack's Weekly Review.
//
// "Levels vs held peak": one meter per domain — this week's fill, last week's
// value as the peak-hold tick. That single device tells the whole
// week-over-week story; there is no second chart and no paired bars.
//
//   tick red    this week is below last week (for spend: above it)
//   tick green  comfortably inside
//   tick needle this week set a new peak — fill and tick coincide
//
// Plus the LOG: each insight as an LED line, the dot stating the kind of
// event (green a best, needle something in the red zone, unlit a quiet input).
import { useTranslation } from 'react-i18next';
import Meter, { type PeakTone } from './Meter';

export interface LevelRow {
  key: string;
  label: string;
  value: number;
  previous: number;
  display: string;
  delta: string;
  /** Spend: more than last week is the bad direction. */
  lowerIsBetter?: boolean;
  onClick?: () => void;
}

function toneFor(r: LevelRow): PeakTone {
  if (r.value === 0 && r.previous === 0) return 'ok';
  if (r.lowerIsBetter) return r.value > r.previous ? 'over' : 'ok';
  if (r.value > r.previous) return 'new';
  if (r.value < r.previous) return 'over';
  return 'ok';
}

export function RackLevels({ rows }: { rows: LevelRow[] }) {
  const { t } = useTranslation();
  return (
    <div className="panel px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="sec">{t('rack.levels')}</span>
        <span className="font-mono text-[0.5625rem] tracking-[0.1em] text-text-faint uppercase">{t('rack.holdPrev')}</span>
      </div>
      <div className="mt-1.5">
        {rows.map((r, i) => {
          const tone = toneFor(r);
          // Room past the larger of the two so neither pins the end.
          const max = Math.max(r.value, r.previous) * 1.15 || 1;
          return (
            <button
              key={r.key}
              type="button"
              onClick={r.onClick}
              className={`w-full flex items-center gap-2 py-1.5 text-start ${i > 0 ? 'border-t border-border-soft' : ''}`}
            >
              <span className="sec text-[0.625rem] w-16 flex-shrink-0 truncate">{r.label}</span>
              <Meter
                className="flex-1 min-w-0"
                value={r.value}
                max={max}
                // No history, no held peak: a tick at zero would read as a
                // warning when there is simply nothing to compare against.
                peak={r.previous > 0 ? r.previous : undefined}
                peakTone={tone}
                height={14}
                label={r.label}
              />
              <span className="w-20 flex-shrink-0 text-end font-mono tabular-nums leading-tight">
                <span className="block text-[0.6875rem]">{r.display}</span>
                <span className={`block text-[0.5625rem] ${tone === 'new' ? 'text-primary' : 'text-text-faint'}`}>
                  {tone === 'new' ? t('rack.newPeak') : r.delta}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface LogLine {
  text: string;
  tone: 'positive' | 'warn' | 'neutral';
}

export function RackLog({ lines }: { lines: LogLine[] }) {
  const { t } = useTranslation();
  if (lines.length === 0) return null;
  return (
    <div className="panel px-3 py-2.5">
      <span className="sec">{t('rack.log')}</span>
      <div className="mt-1.5">
        {lines.map((l, i) => (
          <div key={i} className={`flex items-start gap-2 py-1.5 ${i > 0 ? 'border-t border-border-soft' : ''}`}>
            <span
              className={`rack-led mt-1 ${l.tone === 'positive' ? 'rack-led--ok' : l.tone === 'warn' ? 'rack-led--on' : ''}`}
              aria-hidden="true"
            />
            <span className="text-xs leading-snug">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
