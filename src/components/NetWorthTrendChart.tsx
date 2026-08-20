// v1.9 Item 14b #5 — net worth over time, broken out by account.
//
// DESIGN — one line, one drill-in, no decoration.
// Net worth is a single number over time, so the chart is a single line. The
// composition question ("what is it made of?") is a different question and gets
// a different surface: click any month and the breakdown below re-reads to that
// month. That is the plan's cross-cutting requirement #3 in its literal form —
// "click a net-worth trend point to see that month's account breakdown" — and
// it is built in rather than bolted on.
//
// Geometry is measured, not stretched. The codebase's existing charts use
// `preserveAspectRatio="none"`, which is fine for a 320px sparkline and wrong
// here: at 1600px it turns every dot into an ellipse and every stroke into a
// different weight horizontally than vertically. A ResizeObserver and 1:1 pixel
// coordinates cost fifteen lines and make the chart correct at any width.
//
// Two honesty markers, both from the aggregation:
//   • a caret under a month where an account first appears, because an
//     unexplained vertical step is the fastest way to lose trust in a chart;
//   • a dashed line segment where no holdings snapshot exists yet, so the
//     investing side is missing rather than zero.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetWorthPoint, NetWorthTrend } from '../lib/netWorthTrend';
import { PRIMARY, GROUND } from '../lib/themeColors';

interface Props {
  trend: NetWorthTrend;
  /** Currency every figure is already expressed in. */
  currency: string;
  formatCurrency: (amount: number, currency: string) => string;
  /** Compact form for axis labels, where full precision is noise. */
  formatCompact: (amount: number) => string;
  selected: string | null;
  onSelect: (month: string) => void;
}

const H = 200;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;
const PAD_X = 8;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function NetWorthTrendChart({
  trend,
  currency,
  formatCurrency,
  formatCompact,
  selected,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const points = trend.points;

  const geom = useMemo(() => {
    if (points.length === 0 || width <= 0) return null;
    const values = points.map((p) => p.total);
    const rawMin = Math.min(...values, 0);
    const rawMax = Math.max(...values, 0);
    const pad = (rawMax - rawMin) * 0.08 || Math.abs(rawMax) * 0.1 || 1;
    const yMin = rawMin - pad;
    const yMax = rawMax + pad;
    const span = yMax - yMin || 1;
    const plotH = H - PAD_TOP - PAD_BOTTOM;
    const usableW = Math.max(width - PAD_X * 2, 1);
    const x = (i: number) => PAD_X + (points.length === 1 ? usableW / 2 : (i / (points.length - 1)) * usableW);
    const y = (v: number) => PAD_TOP + plotH - ((v - yMin) / span) * plotH;
    return { x, y, yMin, yMax, zeroY: y(0), showZero: rawMin < 0 };
  }, [points, width]);

  const latest = points[points.length - 1];
  const first = points[0];
  const change = latest && first ? latest.total - first.total : 0;
  const changePct = first && first.total !== 0 ? (change / Math.abs(first.total)) * 100 : null;

  if (points.length === 0) {
    return (
      <div className="text-xs text-text-muted text-center py-8">{t('fin.nwt.empty')}</div>
    );
  }

  // Split into runs of known / unknown holdings so the missing stretch draws
  // dashed instead of solid — same line, visibly less certain.
  const segments: { from: number; to: number; known: boolean }[] = [];
  points.forEach((p, i) => {
    const known = p.holdingsBase != null;
    const last = segments[segments.length - 1];
    if (last && last.known === known) last.to = i;
    else segments.push({ from: Math.max(i - 1, 0), to: i, known });
  });

  const path = (from: number, to: number) =>
    geom
      ? points
          .slice(from, to + 1)
          .map((p, k) => `${k === 0 ? 'M' : 'L'} ${geom.x(from + k).toFixed(1)} ${geom.y(p.total).toFixed(1)}`)
          .join(' ')
      : '';

  const areaPath =
    geom && points.length > 1
      ? `${path(0, points.length - 1)} L ${geom.x(points.length - 1).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} L ${geom
          .x(0)
          .toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} Z`
      : '';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
        <span className="font-heading font-bold text-2xl tracking-tight tabular-nums">
          {formatCurrency(latest.total, currency)}
        </span>
        {points.length > 1 && (
          <span className={`text-xs font-medium tabular-nums ${change >= 0 ? 'text-success' : 'text-danger'}`}>
            {change >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(change), currency)}
            {changePct != null && ` (${changePct.toFixed(1)}%)`}
            <span className="text-text-muted"> · {t('fin.nwt.overWindow', { count: points.length })}</span>
          </span>
        )}
      </div>

      <div ref={wrapRef} className="w-full">
        {geom && (
          <svg width={width} height={H} className="block overflow-visible" role="img" aria-label={t('fin.nwt.aria')}>
            {/* Zero line only when something is actually below it — a
                gridline that never bites is noise. */}
            {geom.showZero && (
              <line
                x1={PAD_X}
                x2={width - PAD_X}
                y1={geom.zeroY}
                y2={geom.zeroY}
                stroke="rgba(248, 81, 73, 0.35)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}
            {areaPath && <path d={areaPath} fill="rgba(232, 163, 61, 0.10)" />}
            {segments
              .filter((s) => s.to > s.from)
              .map((s, i) => (
                <path
                  key={i}
                  d={path(s.from, s.to)}
                  fill="none"
                  stroke={PRIMARY}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.known ? undefined : '5 4'}
                  opacity={s.known ? 1 : 0.65}
                />
              ))}
            {points.map((p, i) => {
              const isSel = (selected ?? latest.month) === p.month;
              return (
                <g key={p.month}>
                  {p.addedAccounts.length > 0 && (
                    <text
                      x={geom.x(i)}
                      y={H - PAD_BOTTOM + 9}
                      textAnchor="middle"
                      className="fill-text-muted"
                      style={{ fontSize: 9 }}
                    >
                      ▲
                    </text>
                  )}
                  <circle
                    cx={geom.x(i)}
                    cy={geom.y(p.total)}
                    r={isSel ? 4.5 : 2.5}
                    fill={isSel ? PRIMARY : GROUND}
                    stroke={PRIMARY}
                    strokeWidth={isSel ? 0 : 1.5}
                  />
                  {/* Generous invisible hit target — a 2.5px dot is not a
                      click target, and this is the drill-in affordance. */}
                  <rect
                    x={geom.x(i) - Math.max(width / points.length / 2, 10)}
                    y={0}
                    width={Math.max(width / points.length, 20)}
                    height={H - PAD_BOTTOM}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => onSelect(p.month)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.month} — ${formatCurrency(p.total, currency)}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(p.month);
                      }
                    }}
                  />
                </g>
              );
            })}
            <text x={PAD_X} y={12} className="fill-text-muted" style={{ fontSize: 9 }}>
              {formatCompact(geom.yMax)}
            </text>
            <text x={PAD_X} y={H - PAD_BOTTOM - 2} className="fill-text-muted" style={{ fontSize: 9 }}>
              {formatCompact(geom.yMin)}
            </text>
          </svg>
        )}
      </div>

      <div className="flex justify-between text-[0.5625rem] text-text-muted mt-0.5">
        <span>{first.month}</span>
        <span>{latest.month}</span>
      </div>
    </div>
  );
}

/** The month's composition. Rendered beside the chart on desktop and below it
 *  elsewhere; either way it is the answer to "what is that number made of". */
export function NetWorthBreakdown({
  point,
  currency,
  formatCurrency,
  typeLabel,
}: {
  point: NetWorthPoint;
  currency: string;
  formatCurrency: (amount: number, currency: string) => string;
  typeLabel: (t: string) => string;
}) {
  const { t } = useTranslation();
  const rows = [
    ...point.accounts.map((a) => ({
      key: a.id,
      label: a.name,
      sub: typeLabel(a.accountType),
      value: a.base,
    })),
    ...(point.holdingsBase != null
      ? [{ key: '__holdings', label: t('fin.nwt.holdings'), sub: t('fin.nwt.fromSnapshot'), value: point.holdingsBase }]
      : []),
    ...(point.portfolioCashBase !== 0
      ? [{ key: '__cash', label: t('fin.nwt.portfolioCash'), sub: t('fin.nwt.ledger'), value: point.portfolioCashBase }]
      : []),
  ];
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="sec">{t('fin.nwt.breakdownFor', { month: point.month })}</span>
        <span className="text-[0.625rem] text-text-muted tabular-nums">{point.asOf}</span>
      </div>
      {point.addedAccounts.length > 0 && (
        <div className="text-[0.625rem] text-text-muted mb-2">
          ▲ {t('fin.nwt.addedHere', { names: point.addedAccounts.join(', ') })}
        </div>
      )}
      {point.holdingsBase == null && (
        <div className="text-[0.625rem] text-warning mb-2">{t('fin.nwt.noSnapshotYet')}</div>
      )}
      <div className="space-y-1.5">
        {rows.length === 0 && <div className="text-xs text-text-muted">{t('fin.nwt.nothingHere')}</div>}
        {rows.map((r) => {
          const negative = r.value < 0;
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate" title={r.label}>
                  {r.label} <span className="text-text-muted text-[0.625rem]">{r.sub}</span>
                </span>
                <span className={`tabular-nums flex-shrink-0 ${negative ? 'text-danger' : 'text-text'}`}>
                  {formatCurrency(r.value, currency)}
                </span>
              </div>
              <div className="h-1 rounded-full bg-surface2 overflow-hidden mt-0.5">
                <div
                  className={`h-full ${negative ? 'bg-danger' : 'bg-primary'}`}
                  style={{ width: `${(Math.abs(r.value) / maxAbs) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-baseline justify-between mt-3 pt-2 border-t border-border text-sm">
        <span className="font-heading font-semibold">{t('fin.nwt.total')}</span>
        <span className={`font-heading font-bold tabular-nums ${point.total >= 0 ? 'text-text' : 'text-danger'}`}>
          {formatCurrency(point.total, currency)}
        </span>
      </div>
    </div>
  );
}
