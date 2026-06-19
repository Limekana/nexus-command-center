// Cash Flow Forecast card — v1.4. Lives in the Balance segment of the Finance
// tab, between the Savings/What-If entries and the Budget Breakdown. Reads the
// transaction set, detects recurring income/expense patterns, and projects the
// next 30 / 60 days. Pure derivation — no store of its own, no persistence.

import { useMemo, useState } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { detectRecurring, projectCashFlow } from '../lib/cashFlowForecast';
import { formatShortDate } from '../utils/formatters';

export default function CashFlowForecastCard() {
  const transactions = useFinanceStore((s) => s.transactions);
  const budgetCategories = useFinanceStore((s) => s.budgetCategories);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  const [forecastDays, setForecastDays] = useState<30 | 60>(30);
  const [expanded, setExpanded] = useState(false);

  const projection = useMemo(() => {
    const names = new Map(
      budgetCategories.map((c) => [c.id, `${c.icon ? c.icon + ' ' : ''}${c.name}`]),
    );
    const recurring = detectRecurring(transactions, baseCurrency, names);
    return projectCashFlow(recurring, forecastDays, baseCurrency);
  }, [transactions, budgetCategories, baseCurrency, forecastDays]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat('fi-FI', {
        style: 'currency',
        currency: baseCurrency,
        maximumFractionDigits: 0,
      }),
    [baseCurrency],
  );

  const enough = projection.recurringItems.length >= 2;
  const net = projection.netCashFlow;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="font-heading font-semibold text-sm">Cash Flow Forecast</span>
        {/* 30 / 60d toggle — local only, no persistence. Mirrors the segmented
            pill language used by the Finance tab spine. */}
        <div className="glass-soft rounded-pill p-0.5 flex text-[10px] font-heading font-semibold uppercase tracking-wider">
          {([30, 60] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setForecastDays(d)}
              className={`px-2.5 py-1 rounded-pill transition-colors duration-200 ${
                forecastDays === d ? 'bg-primary/15 text-primary' : 'text-text-muted'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {!enough ? (
        <div className="text-xs text-text-muted text-center py-4">
          Not enough transaction history to forecast yet.
          <div className="text-[10px] mt-1">
            Patterns appear here after a few recurring payments land.
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted flex items-center gap-1.5">
                <span className="text-success" aria-hidden>↑</span> Expected income
              </span>
              <span className="text-sm font-heading font-semibold text-success">
                +{money.format(projection.projectedIncome)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted flex items-center gap-1.5">
                <span className="text-danger" aria-hidden>↓</span> Expected expenses
              </span>
              <span className="text-sm font-heading font-semibold text-text">
                −{money.format(projection.projectedExpenses)}
              </span>
            </div>
          </div>

          <div className="h-px bg-border/50 my-3" />

          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
              Net projected · {forecastDays}d
            </span>
            <span
              className={`font-heading font-bold text-lg ${net >= 0 ? 'text-success' : 'text-danger'}`}
            >
              {net >= 0 ? '+' : '−'}
              {money.format(Math.abs(net))}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-between mt-3 text-[11px] text-text-muted active:text-primary"
          >
            <span>
              {projection.recurringItems.length} recurring item
              {projection.recurringItems.length === 1 ? '' : 's'} detected
            </span>
            <span className="text-[10px] uppercase tracking-wider">{expanded ? '▲' : '▼'}</span>
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5">
              {projection.recurringItems.map((r) => (
                <div
                  key={r.key}
                  className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0"
                >
                  <span
                    className={`text-xs ${r.type === 'income' ? 'text-success' : 'text-text-muted'}`}
                    aria-hidden
                  >
                    {r.type === 'income' ? '↑' : '↓'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate">{r.label}</div>
                    <div className="text-[10px] text-text-muted">
                      every {cadenceLabel(r.intervalDays)} · next {formatShortDate(r.nextExpected)}
                      {r.confidence === 'medium' && ' · low confidence'}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-heading whitespace-nowrap ${
                      r.type === 'income' ? 'text-success' : 'text-text-muted'
                    }`}
                  >
                    {r.type === 'income' ? '+' : '−'}
                    {money.format(r.estimatedAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function cadenceLabel(intervalDays: 7 | 14 | 30): string {
  if (intervalDays === 7) return 'week';
  if (intervalDays === 14) return '2 weeks';
  return 'month';
}
