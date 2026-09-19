// v1.15 (Item 13, handoff follow-up #46) — Rack's Finance › Portfolio units.
//
//   Master bus   — total value on the meter face, the day's move, and a
//                  13-bar history where only the current bar is lit: the
//                  needle rule applied to a series.
//   Allocation   — one channel per position: its weight as a meter, a tick
//                  for reference, and value + day move on the right. Replaces
//                  the donut under Rack; rebalancing reads straight off it.
//
// Deviation from the handoff, deliberate and labelled on screen: it ticks
// each row at the holding's TARGET weight, and NCC stores no target weights.
// Adding one would be a synced-schema change, so the tick sits at equal
// weight (100% / positions) and the header says so — a reference line the
// user can reason about, never a target they did not set.
import { useTranslation } from 'react-i18next';
import Meter from './Meter';
import type { PortfolioSnapshot } from '../types/finance';

type Fmt = (amount: number, currency: string) => string;

const BARS = 13;

interface MasterProps {
  total: number;
  dayChange: number;
  dayPct: number;
  snapshots: PortfolioSnapshot[];
  baseCurrency: string;
  fmt: Fmt;
  cost?: number | null;
  pl?: number | null;
  plPct?: number | null;
  note?: React.ReactNode;
}

export function RackMasterBus({ total, dayChange, dayPct, snapshots, baseCurrency, fmt, cost, pl, plPct, note }: MasterProps) {
  const { t } = useTranslation();
  const series = snapshots
    .filter((s) => s.baseCurrency === baseCurrency && Number.isFinite(s.valueBase))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-BARS)
    .map((s) => s.valueBase);
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo;
  const up = dayChange >= 0;

  return (
    <div className="panel px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="sec">{t('rack.master')}</span>
        <span className={`font-mono text-xs tabular-nums ${up ? 'text-success' : 'text-danger'}`}>
          {up ? '+' : '−'}{Math.abs(dayPct).toFixed(2)}%
        </span>
      </div>
      <div className="mt-2 ms-2 p-2" style={{ background: 'var(--meter-face)' }}>
        <div className="flex items-baseline justify-between gap-2">
          <div className="meter-readout text-[1.4375rem]">
            {fmt(total, baseCurrency)}
          </div>
          <span className="meter-readout text-xs" style={{ color: up ? 'var(--meter-pos)' : 'rgb(var(--c-danger))' }}>
            {up ? '+' : '−'}{fmt(Math.abs(dayChange), baseCurrency)}
          </span>
        </div>
        {series.length >= 2 && (
          <div className="rack-spark mt-2" aria-hidden="true">
            {series.map((v, i) => (
              <span
                key={i}
                className={i === series.length - 1 ? 'rack-spark__bar rack-spark__bar--now' : 'rack-spark__bar'}
                // Floor at 15% so the lowest point still reads as a bar.
                style={{ height: `${span > 0 ? 15 + ((v - lo) / span) * 85 : 60}%` }}
              />
            ))}
          </div>
        )}
      </div>
      {cost != null && pl != null && (
        <div className="flex items-center justify-between mt-2 text-[0.6875rem]">
          <span className="sec text-[0.625rem]">{t('fin.port.cost')}</span>
          <span className="font-mono tabular-nums">{fmt(cost, baseCurrency)}</span>
          <span className="sec text-[0.625rem]">{t('fin.port.totalPL')}</span>
          <span className={`font-mono tabular-nums ${pl >= 0 ? 'text-success' : 'text-danger'}`}>
            {pl >= 0 ? '+' : '−'}{fmt(Math.abs(pl), baseCurrency)}
            {plPct != null && ` (${pl >= 0 ? '+' : ''}${plPct.toFixed(1)}%)`}
          </span>
        </div>
      )}
      {note && <div className="text-[0.625rem] text-text-muted mt-1.5">{note}</div>}
    </div>
  );
}

export interface AllocationRow {
  key: string;
  ticker: string;
  value: number;
  dayPct: number;
  onClick?: () => void;
}

interface AllocationProps {
  rows: AllocationRow[];
  total: number;
  positionsValue: number;
  baseCurrency: string;
  fmt: Fmt;
}

export function RackAllocation({ rows, total, positionsValue, baseCurrency, fmt }: AllocationProps) {
  const { t } = useTranslation();
  if (rows.length === 0 || total <= 0) return null;
  const equal = 100 / rows.length;
  // The day's largest mover takes the needle colour, whichever way it went.
  let mover = -1;
  rows.forEach((r, i) => {
    if (mover < 0 || Math.abs(r.dayPct) > Math.abs(rows[mover].dayPct)) mover = i;
  });
  const sorted = rows.map((r, i) => ({ ...r, isMover: i === mover && r.dayPct !== 0 })).sort((a, b) => b.value - a.value);
  const invested = Math.round((positionsValue / total) * 100);

  return (
    <div className="panel px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="sec">{t('rack.allocation')}</span>
        <span className="font-mono text-[0.5625rem] tracking-[0.1em] text-text-faint uppercase">{t('rack.tickEqual')}</span>
      </div>
      <div className="mt-1.5">
        {sorted.map((r, i) => {
          const weight = (r.value / total) * 100;
          const tone = r.isMover ? 'text-primary' : r.dayPct >= 0 ? 'text-success' : 'text-danger';
          return (
            <button
              key={r.key}
              type="button"
              onClick={r.onClick}
              className={`w-full flex items-center gap-2 py-1.5 text-start ${i > 0 ? 'border-t border-border-soft' : ''}`}
            >
              <span className="rack-ticker w-20 flex-shrink-0 truncate" title={r.ticker}>{r.ticker}</span>
              <Meter
                className="flex-1 min-w-0"
                value={weight}
                max={100}
                peak={equal}
                peakTone="ok"
                height={14}
                label={t('rack.weightAria', { ticker: r.ticker, pct: weight.toFixed(1) })}
              />
              <span className="w-20 flex-shrink-0 text-end font-mono tabular-nums leading-tight">
                <span className="block text-[0.6875rem]">{fmt(r.value, baseCurrency)}</span>
                <span className={`block text-[0.5625rem] ${tone}`}>
                  {r.dayPct >= 0 ? '+' : '−'}{Math.abs(r.dayPct).toFixed(1)}%
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-border">
        <span className="sec text-[0.625rem]">{t('rack.sum')}</span>
        <span className="font-mono text-[0.5625rem] tracking-[0.08em] text-text-faint uppercase flex-1 text-center">
          {t('rack.positionsInvested', { count: rows.length, pct: invested })}
        </span>
        <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--meter-face)' }}>
          {fmt(positionsValue, baseCurrency)}
        </span>
      </div>
    </div>
  );
}
