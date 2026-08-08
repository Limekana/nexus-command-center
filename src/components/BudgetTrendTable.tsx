// v1.9 Item 14b #6 — budget vs actual, month over month.
//
// DESIGN — a heat grid, not a report.
// The question this answers is "which category is drifting, and since when",
// and that is a two-dimensional question: category × month. A grid is the only
// honest shape for it, and it is exactly what a phone cannot show.
//
// Colour carries the variance and nothing else. A budgeted cell tints toward
// danger as it approaches and passes its limit; an UNBUDGETED cell gets a
// neutral cyan wash proportional to the row's own heaviest month, so the eye
// can still find the spike without the grid implying an overspend against a
// limit the user never set. That distinction is the whole reason the row knows
// whether it has a limit at all.
//
// Every cell is a drill-in (plan requirement #3): click one and the transaction
// list below filters to that category in that month.

import { useTranslation } from 'react-i18next';
import type { BudgetCell, BudgetTrend } from '../lib/budgetTrend';

interface Props {
  trend: BudgetTrend;
  baseCurrency: string;
  formatCurrency: (amount: number, currency: string) => string;
  /** `categoryId` is null for the uncategorised row. */
  onSelect: (categoryId: string | null, month: string, label: string) => void;
  selected: { categoryId: string | null; month: string } | null;
}

/** Short month label — `2026-08` reads as noise repeated twelve times across a
 *  header. January gets the year so a 24-month window stays unambiguous. */
function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const short = d.toLocaleDateString(locale, { month: 'short' });
  return m === 1 ? `${short} ${String(y).slice(2)}` : short;
}

function cellStyle(cell: BudgetCell, hasLimit: boolean, rowMax: number): React.CSSProperties {
  if (cell.actual <= 0) return {};
  if (hasLimit) {
    const ratio = cell.actual / cell.limit;
    if (ratio > 1) {
      // Past the limit: intensity tracks HOW far past, capped so a 5× overspend
      // and a 2× overspend are still distinguishable rather than both maxed.
      const over = Math.min((ratio - 1) / 1, 1);
      return { background: `rgba(248, 81, 73, ${(0.10 + over * 0.22).toFixed(3)})` };
    }
    if (ratio > 0.8) return { background: `rgba(210, 153, 34, ${(ratio * 0.16).toFixed(3)})` };
    return { background: `rgba(0, 212, 255, ${(ratio * 0.07).toFixed(3)})` };
  }
  const share = rowMax > 0 ? cell.actual / rowMax : 0;
  return { background: `rgba(0, 212, 255, ${(share * 0.07).toFixed(3)})` };
}

export default function BudgetTrendTable({
  trend,
  baseCurrency,
  formatCurrency,
  onSelect,
  selected,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const months = trend.months;

  if (trend.isEmpty) {
    return <div className="text-xs text-text-muted text-center py-6">{t('fin.bvt.empty')}</div>;
  }

  const grid = {
    gridTemplateColumns: `minmax(130px, 1.4fr) 92px repeat(${months.length}, minmax(58px, 1fr))`,
  };

  const money = (v: number) => formatCurrency(v, baseCurrency);
  const compact = (v: number) =>
    new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v);

  const isSel = (categoryId: string | null, month: string) =>
    selected?.categoryId === categoryId && selected?.month === month;

  const renderRow = (
    key: string,
    label: string,
    icon: string | undefined,
    limit: number,
    hasLimit: boolean,
    cells: BudgetCell[],
    categoryId: string | null,
    tone: 'normal' | 'muted' | 'total',
  ) => {
    const rowMax = Math.max(...cells.map((c) => c.actual), 0);
    return (
      <div
        key={key}
        role="row"
        className={`grid gap-px items-stretch border-b border-border/30 ${
          tone === 'total' ? 'border-t border-border font-heading font-semibold' : ''
        }`}
        style={grid}
      >
        <div
          role="rowheader"
          className={`px-2 py-1.5 text-xs truncate flex items-center gap-1.5 ${
            tone === 'muted' ? 'text-text-muted' : ''
          }`}
          title={label}
        >
          {icon && <span aria-hidden>{icon}</span>}
          <span className="truncate">{label}</span>
        </div>
        <div className="px-2 py-1.5 text-xs text-end tabular-nums text-text-muted">
          {hasLimit ? money(limit) : <span title={t('fin.bvt.noLimit')}>—</span>}
        </div>
        {cells.map((c) => {
          const clickable = tone !== 'total' && c.actual > 0;
          const sel = isSel(categoryId, c.month);
          return (
            <button
              key={c.month}
              role="cell"
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(categoryId, c.month, label)}
              style={cellStyle(c, hasLimit, rowMax)}
              className={`px-1 py-1.5 text-[11px] text-end tabular-nums transition-colors ${
                clickable ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
              } ${sel ? 'ring-1 ring-inset ring-primary' : ''} ${
                c.over ? 'text-danger' : c.actual > 0 ? 'text-text' : 'text-text-muted/40'
              }`}
              aria-label={`${label} ${c.month}: ${money(c.actual)}`}
            >
              {c.actual > 0 ? compact(c.actual) : '·'}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div role="table" aria-label={t('fin.bvt.aria')} className="min-w-[640px]">
          <div role="row" className="grid gap-px border-b border-border" style={grid}>
            <span role="columnheader" className="sec px-2 pb-1.5">
              {t('fin.bvt.category')}
            </span>
            <span role="columnheader" className="sec px-2 pb-1.5 text-end">
              {t('fin.bvt.budget')}
            </span>
            {months.map((m) => (
              <span key={m} role="columnheader" className="sec px-1 pb-1.5 text-end">
                {monthLabel(m, locale)}
              </span>
            ))}
          </div>

          {trend.categories.map((c) =>
            renderRow(c.categoryId, c.name, c.icon, c.limit, c.hasLimit, c.cells, c.categoryId, 'normal'),
          )}
          {trend.uncategorised.some((c) => c.actual > 0) &&
            renderRow(
              '__uncat',
              t('fin.flow.uncategorised'),
              undefined,
              0,
              false,
              trend.uncategorised,
              null,
              'muted',
            )}
          {renderRow('__total', t('fin.bvt.total'), undefined, trend.totals[0]?.limit ?? 0, (trend.totals[0]?.limit ?? 0) > 0, trend.totals, null, 'total')}
        </div>
      </div>

      <div className="mt-2 space-y-0.5">
        {trend.noLimitsSet && <div className="text-[10px] text-warning">{t('fin.bvt.noLimitsSet')}</div>}
        {/* The one claim this view could accidentally make and shouldn't. */}
        <div className="text-[10px] text-text-muted">{t('fin.bvt.limitCaveat')}</div>
      </div>
    </div>
  );
}
