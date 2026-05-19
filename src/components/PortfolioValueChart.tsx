// Line chart of portfolio value over time. Reads from local daily snapshots
// (one per refresh-day max). Supports 30d / 90d / 365d range toggles.
//
// Y-axis is auto-fit to the visible range with a 5% padding on each side so
// the trend reads clearly without flattening into the chart's edges. We
// render two paths: a thin filled area under the line for visual mass, and
// the line itself for precision. End point gets a small dot.

import { useState } from 'react';
import type { PortfolioSnapshot } from '../types/finance';

interface Props {
  snapshots: PortfolioSnapshot[];
  baseCurrency: string;
  formatCurrency: (amount: number, currency: string) => string;
}

type Range = '30d' | '90d' | '365d' | 'all';

function filterRange(snapshots: PortfolioSnapshot[], range: Range): PortfolioSnapshot[] {
  if (range === 'all') return snapshots;
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  return snapshots.filter((s) => s.date >= cutoffKey);
}

export default function PortfolioValueChart({ snapshots, baseCurrency, formatCurrency }: Props) {
  const [range, setRange] = useState<Range>('30d');

  const filtered = filterRange(snapshots, range);

  // We need at least 2 points to draw a line. When the user has 0 or 1 snapshot
  // the chart hides itself with a friendly hint — refresh once a day and it
  // populates organically.
  if (filtered.length < 2) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="font-heading font-semibold text-sm">Portfolio Value</span>
          <RangeToggle value={range} onChange={setRange} />
        </div>
        <div className="text-xs text-text-muted text-center py-6">
          {snapshots.length === 0
            ? 'No history yet — refresh once a day to start building a chart.'
            : `Only ${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'} so far. Come back tomorrow.`}
        </div>
      </div>
    );
  }

  const values = filtered.map((s) => s.valueBase);
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const changePct = first > 0 ? (change / first) * 100 : 0;
  const trendUp = change >= 0;

  // Pad y-axis 5% on each side so the line doesn't kiss the edges.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.05 || max * 0.01 || 1;
  const yMin = min - padding;
  const yMax = max + padding;
  const ySpan = yMax - yMin || 1;

  const W = 320;
  const H = 100;
  const points = filtered.map((s, i) => {
    const x = (i / (filtered.length - 1)) * W;
    const y = H - ((s.valueBase - yMin) / ySpan) * H;
    return { x, y };
  });
  const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const strokeColor = trendUp ? '#3FB950' : '#F85149';
  const areaColor = trendUp ? 'rgba(63, 185, 80, 0.12)' : 'rgba(248, 81, 73, 0.12)';
  const endPoint = points[points.length - 1];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading font-semibold text-sm">Portfolio Value</span>
        <RangeToggle value={range} onChange={setRange} />
      </div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-heading font-bold text-xl tracking-tight">
          {formatCurrency(last, baseCurrency)}
        </span>
        <span className={`text-xs font-medium ${trendUp ? 'text-success' : 'text-danger'}`}>
          {trendUp ? '↑' : '↓'} {formatCurrency(Math.abs(change), baseCurrency)} ({changePct.toFixed(1)}%)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
        className="block"
      >
        <path d={areaPath} fill={areaColor} />
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={endPoint.x} cy={endPoint.y} r="3" fill={strokeColor} />
      </svg>
      <div className="flex justify-between text-[9px] text-text-muted mt-1">
        <span>{filtered[0].date}</span>
        <span>{filtered[filtered.length - 1].date}</span>
      </div>
    </div>
  );
}

function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const ranges: Range[] = ['30d', '90d', '365d', 'all'];
  return (
    <div className="flex gap-1">
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
            value === r
              ? 'border-primary/40 bg-primary/5 text-primary'
              : 'border-border text-text-muted'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
