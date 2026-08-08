// v1.9 Item 14b #2 — the cash-flow diagram. Renderer half; the model comes
// from lib/cashFlow.ts and is shared with budget-vs-actual (#6).
//
// DESIGN. A Sankey is the one chart that answers "where does the paycheck
// actually go" in a single glance, because the width of a band IS the money.
// Hand-built rather than pulled from a library: the shape here is a fixed
// three-column sources -> trunk -> sinks flow, not a general graph, and the
// layout for that is a running offset and a cubic bezier. A layout solver
// would be a dependency and a bundle for arithmetic we do not need.
//
// Colour follows the app rather than inventing a scheme: sinks reuse
// DonutChart's palette via colorForIndex, so a category is the same colour
// here as in the allocation donut. Income and the trunk stay cyan — money
// arrives as one thing and leaves as many named things, and keeping one
// dominant field with selective accents is the house style. The synthetic
// nodes get semantic colour instead of palette colour: saved is primary,
// left over is success, debt and deficit are warning/danger, because those
// four are outcomes rather than categories.
//
// Every band is clickable (the plan's cross-cutting requirement #3 — built in
// from the start, not bolted on). Category-backed bands carry `categoryId`,
// so the caller can filter the transaction list to exactly that flow.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { colorForIndex } from './DonutChart';
import { formatMoney } from '../lib/currencies';
import type { CashFlowModel, CashFlowNode } from '../lib/cashFlow';

interface Props {
  model: CashFlowModel;
  baseCurrency: string;
  /** Fired for a band or its end node. Category-backed nodes carry
   *  `categoryId`; synthetic ones carry `synthetic` instead. */
  onSelect?: (node: CashFlowNode) => void;
}

const W = 880;
const BAR = 13;          // node bar thickness
const GAP = 6;           // vertical breathing room between nodes in a column
const MIN_BAND = 2;      // a rounding-error band still has to be clickable
const LABEL_PAD = 10;

/** Semantic colour for the synthetic nodes; palette colour for real ones. */
function colorFor(node: CashFlowNode, paletteIndex: number): string {
  switch (node.synthetic) {
    case 'saved': return '#00D4FF';     // primary — the good outcome
    case 'leftover': return '#3FB950';  // success
    case 'debt': return '#D29922';      // warning
    case 'deficit': return '#F85149';   // danger — funded from reserves
    case 'otherIncome':
    case 'uncategorised': return '#7D8590'; // muted — unnamed money
    default: return colorForIndex(paletteIndex);
  }
}

interface Laid {
  node: CashFlowNode;
  y: number;
  h: number;
  color: string;
}

export default function CashFlowDiagram({ model, baseCurrency, onSelect }: Props) {
  const { t } = useTranslation();

  const layout = useMemo(() => {
    const total = model.sources.reduce((s, n) => s + n.value, 0);
    // The aggregation guarantees sources and sinks balance, so one scale
    // serves both columns. If that ever stops being true the diagram would
    // silently mislead, so fall back to the larger side rather than trusting.
    const outTotal = model.sinks.reduce((s, n) => s + n.value, 0);
    const scaleTotal = Math.max(total, outTotal);

    const rows = Math.max(model.sources.length, model.sinks.length);
    const H = Math.max(240, rows * 46);
    // Both columns share one available height, so equal money is equal
    // thickness on either side regardless of how many nodes each has.
    const avail = Math.max(40, H - Math.max(0, rows - 1) * GAP);

    const place = (nodes: CashFlowNode[]): Laid[] => {
      const used = nodes.reduce((s, n) => s + (n.value / scaleTotal) * avail, 0);
      const gaps = Math.max(0, nodes.length - 1) * GAP;
      let y = (H - used - gaps) / 2; // centre the shorter column
      return nodes.map((node, i) => {
        const h = Math.max(MIN_BAND, (node.value / scaleTotal) * avail);
        const laid: Laid = { node, y, h, color: colorFor(node, i) };
        y += h + GAP;
        return laid;
      });
    };

    const sources = place(model.sources);
    const sinks = place(model.sinks);

    // Trunk attachment points use each band's own thickness, so ribbons are
    // parallel-sided rather than tapering — a tapering band reads as a
    // changing amount, which would be a lie.
    const stack = (laid: Laid[]) => {
      const usedH = laid.reduce((s, l) => s + l.h, 0);
      let y = (H - usedH) / 2;
      return laid.map((l) => {
        const at = y;
        y += l.h;
        return at;
      });
    };

    return {
      H,
      sources,
      sinks,
      inAt: stack(sources),
      outAt: stack(sinks),
      trunkX: W / 2 - BAR / 2,
    };
  }, [model]);

  if (model.isEmpty) {
    return (
      <div className="card text-center py-8">
        <div className="font-heading font-semibold text-sm mb-1">{t('fin.flow.title')}</div>
        <div className="text-xs text-text-muted">{t('fin.flow.empty')}</div>
      </div>
    );
  }

  const { H, sources, sinks, inAt, outAt, trunkX } = layout;
  const money = (n: number) => formatMoney(n, baseCurrency);

  // A band: parallel-sided cubic between two vertical edges.
  const band = (x1: number, y1: number, x2: number, y2: number, h: number) => {
    const mid = (x1 + x2) / 2;
    return [
      `M ${x1},${y1}`,
      `C ${mid},${y1} ${mid},${y2} ${x2},${y2}`,
      `L ${x2},${y2 + h}`,
      `C ${mid},${y2 + h} ${mid},${y1 + h} ${x1},${y1 + h}`,
      'Z',
    ].join(' ');
  };

  const click = (n: CashFlowNode) => onSelect?.(n);

  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-heading font-semibold text-sm">{t('fin.flow.title')}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
          {t('fin.flow.in')} {money(model.totalIn)} · {t('fin.flow.out')} {money(model.totalOut)}
        </span>
      </div>
      <div className="text-[11px] text-text-muted mb-3">
        {model.net >= 0
          ? t('fin.flow.surplus', { amount: money(model.net) })
          : t('fin.flow.deficit', { amount: money(-model.net) })}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label={t('fin.flow.title')}
          style={{ minWidth: 620 }}
        >
          {/* Ribbons first so the node bars and labels sit above them. */}
          <g>
            {sources.map((l, i) => (
              <path
                key={`in-${l.node.id}`}
                d={band(BAR, l.y, trunkX, inAt[i], l.h)}
                fill={l.color}
                fillOpacity={0.28}
                className="cursor-pointer transition-[fill-opacity] hover:fill-opacity-100"
                style={{ transition: 'fill-opacity 160ms' }}
                onMouseEnter={(e) => e.currentTarget.setAttribute('fill-opacity', '0.55')}
                onMouseLeave={(e) => e.currentTarget.setAttribute('fill-opacity', '0.28')}
                onClick={() => click(l.node)}
              >
                <title>{`${l.node.label} → ${money(l.node.value)}`}</title>
              </path>
            ))}
            {sinks.map((l, i) => (
              <path
                key={`out-${l.node.id}`}
                d={band(trunkX + BAR, outAt[i], W - BAR, l.y, l.h)}
                fill={l.color}
                fillOpacity={0.28}
                className="cursor-pointer"
                style={{ transition: 'fill-opacity 160ms' }}
                onMouseEnter={(e) => e.currentTarget.setAttribute('fill-opacity', '0.55')}
                onMouseLeave={(e) => e.currentTarget.setAttribute('fill-opacity', '0.28')}
                onClick={() => click(l.node)}
              >
                <title>{`${l.node.label} → ${money(l.node.value)}`}</title>
              </path>
            ))}
          </g>

          {/* The trunk — one solid cyan column. Everything passes through it. */}
          <rect x={trunkX} y={0} width={BAR} height={H} rx={2} fill="#00D4FF" fillOpacity={0.9} />

          {/* Node bars + labels. Buttons rather than decoration: the plan wants
              every band drillable, and the bar is the easiest target. */}
          {sources.map((l) => (
            <g
              key={`sn-${l.node.id}`}
              role="button"
              tabIndex={0}
              aria-label={`${l.node.label}, ${money(l.node.value)}`}
              onClick={() => click(l.node)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && click(l.node)}
              className="cursor-pointer"
            >
              <rect x={0} y={l.y} width={BAR} height={l.h} rx={2} fill={l.color} />
              <text
                x={BAR + LABEL_PAD}
                y={l.y + l.h / 2}
                dominantBaseline="middle"
                className="fill-text"
                style={{ fontSize: 11 }}
              >
                {l.node.label}
              </text>
              <text
                x={BAR + LABEL_PAD}
                y={l.y + l.h / 2 + 13}
                dominantBaseline="middle"
                className="fill-text-muted"
                style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
              >
                {money(l.node.value)}
              </text>
            </g>
          ))}
          {sinks.map((l) => (
            <g
              key={`kn-${l.node.id}`}
              role="button"
              tabIndex={0}
              aria-label={`${l.node.label}, ${money(l.node.value)}`}
              onClick={() => click(l.node)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && click(l.node)}
              className="cursor-pointer"
            >
              <rect x={W - BAR} y={l.y} width={BAR} height={l.h} rx={2} fill={l.color} />
              <text
                x={W - BAR - LABEL_PAD}
                y={l.y + l.h / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-text"
                style={{ fontSize: 11 }}
              >
                {l.node.label}
              </text>
              <text
                x={W - BAR - LABEL_PAD}
                y={l.y + l.h / 2 + 13}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-text-muted"
                style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
              >
                {money(l.node.value)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
