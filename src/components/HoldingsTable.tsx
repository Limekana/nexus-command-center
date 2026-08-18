// v1.9 Item 14b — dense holdings table, desktop tier only.
//
// The phone renders holdings as a card stack, which is right for a thumb and
// wrong for a 1680px window: eight numbers per position, stacked, is a lot of
// scrolling to answer "which position is dragging?". This is the surface the
// desktop edition exists for — spreadsheet density is the thing a phone
// genuinely cannot do.
//
// DESIGN — instrument panel, not admin datatable.
// The one deliberate move: allocation % is drawn as a cyan wash BEHIND each
// row, so the table doubles as the allocation chart. It is real data rendered
// as substrate rather than a decorative stripe, and it means the eye finds the
// heavy positions without reading a single number. Everything else stays
// quiet — no zebra striping (the generic-datatable tell), no gridlines, colour
// only where it carries meaning.
//
// Built from divs with ARIA table roles rather than <table>: the allocation
// wash has to span the full row, and `position: relative` on <tr> is not
// dependable. Roles keep it a table to assistive tech.
//
// Numbers are `tabular-nums` throughout so columns align on the decimal as
// values tick. Gain/loss colour appears ONLY on the two delta columns — a
// market value is not "good" or "bad", it is just a number.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/currencies';
import type { PortfolioHolding } from '../types/finance';

/** Mirrors Portfolio.tsx's per-position metrics; passed in, never recomputed
 *  here. The FX + cost-basis maths lives in one place (`metricsFor`) and this
 *  component only renders it — duplicating that would be a correctness bug
 *  waiting to happen in a screen full of money. */
export interface HoldingsTableRow {
  holding: PortfolioHolding;
  valueBase: number | null;
  dayChangeBase: number | null;
  dayChangePct: number;
  costBase: number | null;
  plBase: number | null;
  plPct: number | null;
  currency: string;
  sector: string;
  sparkKey: string;
}

type SortKey = 'position' | 'sector' | 'shares' | 'cost' | 'value' | 'day' | 'ret' | 'alloc';

interface Props {
  rows: HoldingsTableRow[];
  /** Sum of the non-null `valueBase` values; allocation is a share of this. */
  totalBase: number;
  baseCurrency: string;
  onSelect: (h: PortfolioHolding) => void;
}

const GRID =
  'grid-cols-[minmax(9.375rem,1.7fr)_minmax(6rem,1fr)_5.5rem_7rem_7.75rem_8.25rem_8.5rem_6.5rem]';

/** Nulls here are real and distinct from zero: no quote has arrived yet, or no
 *  lots were ever recorded so cost basis is genuinely unknown. Rendering them
 *  as 0 would invent a number the user never entered. */
const DASH = '—';

export default function HoldingsTable({ rows, totalBase, baseCurrency, onSelect }: Props) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'value',
    dir: 'desc',
  });

  // v1.9 Item 14b #3 — the table's own drill-down. Opening the detail sheet is
  // a drill-IN to one position; the question a dense table also raises is
  // "show me just my tech", which is a filter. Clicking a sector cell narrows
  // the table to that sector; everything downstream — allocation wash, totals,
  // the allocation percentages themselves — recomputes against the filtered
  // set, so the percentages read as share-of-sector rather than silently
  // staying share-of-portfolio while the rows change underneath them.
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const visible = useMemo(
    () => (sectorFilter ? rows.filter((r) => r.sector === sectorFilter) : rows),
    [rows, sectorFilter],
  );

  const sorted = useMemo(() => {
    // Nulls always sink to the bottom regardless of direction — a position
    // with no quote is not "the smallest", it is unknown, and letting it head
    // an ascending sort would bury the real answer.
    const val = (r: HoldingsTableRow): number | string | null => {
      switch (sort.key) {
        case 'position': return r.holding.ticker.toUpperCase();
        case 'sector': return r.sector;
        case 'shares': return r.holding.quantity;
        case 'cost': return r.costBase;
        case 'value': return r.valueBase;
        case 'day': return r.dayChangePct;
        case 'ret': return r.plPct;
        case 'alloc': return r.valueBase;
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...visible].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [visible, sort]);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    let day = 0;
    let anyValue = false;
    let anyCost = false;
    for (const r of visible) {
      if (r.valueBase != null) { value += r.valueBase; anyValue = true; }
      if (r.costBase != null) { cost += r.costBase; anyCost = true; }
      if (r.dayChangeBase != null) day += r.dayChangeBase;
    }
    const pl = anyValue && anyCost ? value - cost : null;
    return {
      value: anyValue ? value : null,
      cost: anyCost ? cost : null,
      day,
      pl,
      plPct: pl != null && cost > 0 ? (pl / cost) * 100 : null,
    };
  }, [visible]);

  // Allocation is a share of what is on screen. Keeping the portfolio-wide
  // denominator under a sector filter would show six rows whose percentages
  // sum to 18% with no explanation of the missing 82%.
  const allocBase = sectorFilter ? (totals.value ?? 0) : totalBase;

  const onHeader = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'position' || key === 'sector' ? 'asc' : 'desc' }));

  const money = (n: number | null) => (n == null ? DASH : formatMoney(n, baseCurrency));
  const pct = (n: number | null) => (n == null ? DASH : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
  const tone = (n: number | null | undefined) =>
    n == null || n === 0 ? 'text-text-muted' : n > 0 ? 'text-success' : 'text-danger';

  const columns: { key: SortKey; label: string; align: 'start' | 'end' }[] = [
    { key: 'position', label: t('fin.tbl.position'), align: 'start' },
    { key: 'sector', label: t('fin.tbl.sector'), align: 'start' },
    { key: 'shares', label: t('fin.tbl.shares'), align: 'end' },
    { key: 'cost', label: t('fin.tbl.cost'), align: 'end' },
    { key: 'value', label: t('fin.tbl.value'), align: 'end' },
    { key: 'day', label: t('fin.tbl.day'), align: 'end' },
    { key: 'ret', label: t('fin.tbl.return'), align: 'end' },
    { key: 'alloc', label: t('fin.tbl.allocation'), align: 'end' },
  ];

  if (rows.length === 0) return null;

  return (
    <>
      {sectorFilter && (
        <button
          type="button"
          onClick={() => setSectorFilter(null)}
          className="mb-2 inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 py-1 text-[0.6875rem] text-primary"
        >
          {sectorFilter}
          <span className="text-primary/70">{t('fin.tbl.ofCount', { count: visible.length })}</span>
          <span aria-hidden>&times;</span>
        </button>
      )}
    <div className="panel overflow-hidden" role="table" aria-label={t('fin.tbl.aria')}>
      {/* Header — mono micro-labels, sticky so the columns stay named while a
          long portfolio scrolls. The active column goes cyan and carries the
          caret; that is the whole sort affordance. */}
      <div
        role="row"
        className={`grid ${GRID} gap-x-3 px-4 py-2.5 sticky top-0 z-10 panel border-b border-border`}
      >
        {columns.map((c) => {
          const active = sort.key === c.key;
          return (
            <button
              key={c.key}
              type="button"
              role="columnheader"
              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              onClick={() => onHeader(c.key)}
              className={`flex items-center gap-1 text-[0.625rem] uppercase tracking-[0.12em] transition-colors ${
                c.align === 'end' ? 'justify-end' : 'justify-start'
              } ${active ? 'text-primary' : 'text-text-muted hover:text-text'}`}
            >
              {c.label}
              <span aria-hidden className={active ? 'opacity-100' : 'opacity-0'}>
                {sort.dir === 'asc' ? '▲' : '▼'}
              </span>
            </button>
          );
        })}
      </div>

      <div role="rowgroup">
        {sorted.map((r) => {
          const alloc = allocBase > 0 && r.valueBase != null ? (r.valueBase / allocBase) * 100 : null;
          return (
            <div
              key={r.holding.id}
              role="row"
              tabIndex={0}
              onClick={() => onSelect(r.holding)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(r.holding)}
              className={`relative grid ${GRID} gap-x-3 px-4 py-2.5 cursor-pointer border-b border-border/60 last:border-b-0 transition-colors hover:bg-surface-highlight focus-visible:bg-surface-highlight outline-none group`}
            >
              {/* The allocation wash. Sits behind the row's content, width is
                  the position's share of the portfolio — so scanning down the
                  left edge reads as a bar chart of concentration. */}
              {alloc != null && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 start-0 bg-primary/[0.07] pointer-events-none motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-spring-soft"
                  style={{ width: `${Math.min(100, alloc)}%` }}
                />
              )}
              {/* Cyan edge rail on hover — same active language as SideNav, so
                  the two read as one system rather than two components. */}
              <span
                aria-hidden
                className="absolute inset-y-0 start-0 w-0.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              />

              <div role="cell" className="relative min-w-0">
                <div className="font-heading font-semibold text-sm truncate">{r.holding.ticker}</div>
                <div className="text-[0.6875rem] text-text-muted truncate">{r.holding.name}</div>
              </div>
              <div role="cell" className="relative min-w-0 self-center">
                {/* The sector cell is the filter handle. stopPropagation so a
                    click here narrows the table instead of also opening the
                    detail sheet for whatever row happened to be under it. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSectorFilter((cur) => (cur === r.sector ? null : r.sector));
                  }}
                  className={`text-[0.6875rem] truncate block max-w-full text-start rounded-sm px-1 -mx-1 transition-colors ${
                    sectorFilter === r.sector
                      ? 'text-primary bg-primary/10'
                      : 'text-text-muted hover:text-primary'
                  }`}
                  aria-pressed={sectorFilter === r.sector}
                  title={t('fin.tbl.filterSector', { sector: r.sector })}
                >
                  {r.sector}
                </button>
              </div>
              <div role="cell" className="relative self-center text-end text-xs tabular-nums">
                {r.holding.quantity}
              </div>
              <div role="cell" className="relative self-center text-end text-xs tabular-nums text-text-muted">
                {money(r.costBase)}
              </div>
              <div role="cell" className="relative self-center text-end text-sm tabular-nums font-heading font-semibold">
                {money(r.valueBase)}
              </div>
              <div role="cell" className={`relative self-center text-end text-xs tabular-nums ${tone(r.dayChangeBase)}`}>
                <div>{money(r.dayChangeBase)}</div>
                <div className="text-[0.625rem] opacity-80">{pct(r.dayChangePct)}</div>
              </div>
              <div role="cell" className={`relative self-center text-end text-xs tabular-nums ${tone(r.plBase)}`}>
                <div>{money(r.plBase)}</div>
                <div className="text-[0.625rem] opacity-80">{pct(r.plPct)}</div>
              </div>
              <div role="cell" className="relative self-center text-end text-xs tabular-nums text-text-muted">
                {alloc == null ? DASH : `${alloc.toFixed(1)}%`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals — a distinct band rather than another row, because it is a
          summary, not a position. No allocation figure: it is always 100%. */}
      <div
        role="row"
        className={`grid ${GRID} gap-x-3 px-4 py-3 panel border-t border-border`}
      >
        <div role="cell" className="font-heading font-semibold text-xs uppercase tracking-[0.12em] text-text-muted self-center">
          {t('fin.tbl.total')}
        </div>
        <div role="cell" className="self-center text-[0.6875rem] text-text-muted">
          {t('fin.tbl.positions', { count: visible.length })}
        </div>
        <div role="cell" />
        <div role="cell" className="self-center text-end text-xs tabular-nums text-text-muted">
          {money(totals.cost)}
        </div>
        <div role="cell" className="self-center text-end text-sm tabular-nums font-heading font-bold">
          {money(totals.value)}
        </div>
        <div role="cell" className={`self-center text-end text-xs tabular-nums ${tone(totals.day)}`}>
          {money(totals.day)}
        </div>
        <div role="cell" className={`self-center text-end text-xs tabular-nums ${tone(totals.pl)}`}>
          <div>{money(totals.pl)}</div>
          <div className="text-[0.625rem] opacity-80">{pct(totals.plPct)}</div>
        </div>
        <div role="cell" />
      </div>
    </div>
    </>
  );
}
