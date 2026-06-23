// ─── v1.3.1 (BUG-23) Realized P&L + Closed positions ──────────────────────
//
// Self-contained Portfolio section that surfaces the stock-sales side of the
// ledger: cumulative realized gain/loss (tap to expand the per-sale history)
// and a collapsible list of positions the user has fully sold out of. Reads
// straight from useFinanceStore; renders nothing until the first sale exists.

import { useMemo, useState } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { convertSync } from '../api/fxRates';
import { lotRemaining } from '../lib/stockSaleFifo';

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', SEK: 'kr', NOK: 'kr', DKK: 'kr', CHF: 'Fr', JPY: '¥',
};

/** Absolute-value money formatter — callers prefix the sign so the colour and
 *  the +/− glyph stay in lockstep. */
function fmt(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? '';
  const isSuffix = ['kr', 'Fr'].includes(sym);
  const num = Math.abs(amount).toLocaleString('fi-FI', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return isSuffix ? `${num} ${sym}` : sym ? `${sym}${num}` : `${num} ${currency}`;
}

export default function RealizedPnLSection() {
  const stockSales = useFinanceStore((s) => s.stockSales);
  const holdings = useFinanceStore((s) => s.holdings);
  const portfolioLots = useFinanceStore((s) => s.portfolioLots);
  const fxRates = useFinanceStore((s) => s.fxRates);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  const [showHistory, setShowHistory] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  // Cumulative realized P/L in base currency (best-effort — sales in a
  // currency we can't convert yet are skipped and flagged as partial).
  const realized = useMemo(() => {
    let totalBase = 0;
    let partial = false;
    for (const s of stockSales) {
      const conv = convertSync(s.realizedGainLoss, s.currency, baseCurrency, fxRates);
      if (conv == null) { partial = true; continue; }
      totalBase += conv;
    }
    return { totalBase, partial };
  }, [stockSales, fxRates, baseCurrency]);

  // Closed positions — holdings whose net remaining shares hit zero AND that
  // have at least one recorded sale (separates "sold out" from "never owned").
  const closed = useMemo(() => {
    const salesByHolding = new Map<string, typeof stockSales>();
    for (const s of stockSales) {
      if (!s.holdingId) continue;
      const arr = salesByHolding.get(s.holdingId) ?? [];
      arr.push(s);
      salesByHolding.set(s.holdingId, arr);
    }
    const out: Array<{
      id: string; ticker: string; invested: number; proceeds: number; gl: number;
    }> = [];
    for (const h of holdings) {
      const hSales = salesByHolding.get(h.id);
      if (!hSales || hSales.length === 0) continue;
      const hLots = portfolioLots.filter((l) => l.holdingId === h.id);
      const remaining = hLots.reduce((a, l) => a + lotRemaining(l), 0);
      if (remaining > 1e-9) continue; // still an open position
      let invested = 0;
      let proceeds = 0;
      let gl = 0;
      for (const l of hLots) {
        const conv = convertSync(l.quantity * l.costPerUnit, l.costCurrency, baseCurrency, fxRates);
        if (conv != null) invested += conv;
      }
      for (const s of hSales) {
        const pConv = convertSync(s.salePricePerShare * s.sharesSold, s.currency, baseCurrency, fxRates);
        const gConv = convertSync(s.realizedGainLoss, s.currency, baseCurrency, fxRates);
        if (pConv != null) proceeds += pConv;
        if (gConv != null) gl += gConv;
      }
      out.push({ id: h.id, ticker: h.ticker.toUpperCase(), invested, proceeds, gl });
    }
    return out;
  }, [holdings, stockSales, portfolioLots, fxRates, baseCurrency]);

  if (stockSales.length === 0) return null;

  const sortedSales = [...stockSales].sort((a, b) => (b.soldAt || '').localeCompare(a.soldAt || ''));

  return (
    <>
      {/* Realized P&L — tap to expand the per-sale history */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="card text-left w-full active:bg-surface2/40"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
              Realized P&L
            </div>
            <div className={`font-heading font-bold text-xl ${realized.totalBase >= 0 ? 'text-success' : 'text-danger'}`}>
              {realized.totalBase >= 0 ? '+' : '−'}{fmt(realized.totalBase, baseCurrency)}
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {stockSales.length} sale{stockSales.length === 1 ? '' : 's'} {showHistory ? '▲' : '▼'}
          </span>
        </div>
        {realized.partial && (
          <div className="text-[10px] text-text-muted mt-1">
            Partial — some sales in currencies without a live FX rate.
          </div>
        )}
      </button>

      {showHistory && (
        <div className="card">
          <div className="font-heading font-semibold text-sm mb-2">Sale history</div>
          {sortedSales.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0 text-xs"
            >
              <div className="min-w-0">
                <div className="font-medium">{s.ticker.toUpperCase()}</div>
                <div className="text-[10px] text-text-muted">
                  {s.soldAt} · {s.sharesSold} sh @ {fmt(s.salePricePerShare, s.currency)}
                </div>
              </div>
              <div className={`text-right whitespace-nowrap ${s.realizedGainLoss >= 0 ? 'text-success' : 'text-danger'}`}>
                {s.realizedGainLoss >= 0 ? '+' : '−'}{fmt(s.realizedGainLoss, s.currency)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Closed positions — muted, collapsible */}
      {closed.length > 0 && (
        <div className="card" style={{ opacity: 0.85 }}>
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="font-heading font-semibold text-sm">Closed positions</span>
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              {closed.length} · {showClosed ? '▲' : '▼'}
            </span>
          </button>
          {showClosed && (
            <div className="mt-2">
              {closed.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-1.5 border-t border-border/40 first:border-t-0 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{c.ticker}</div>
                    <div className="text-[10px] text-text-muted">
                      Invested {fmt(c.invested, baseCurrency)} → Proceeds {fmt(c.proceeds, baseCurrency)}
                    </div>
                  </div>
                  <div className={`text-right whitespace-nowrap ${c.gl >= 0 ? 'text-success' : 'text-danger'}`}>
                    {c.gl >= 0 ? '+' : '−'}{fmt(c.gl, baseCurrency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
