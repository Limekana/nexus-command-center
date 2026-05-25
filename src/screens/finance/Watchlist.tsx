// Tickers tracked without owning. Reuses the existing quote pipeline (added
// to refreshPortfolio's equity/crypto batches via the store), so each row
// shows live current price + day change + a sparkline.
//
// Tapping a row opens the same HoldingDetailSheet used on the Portfolio
// screen — fundamentals, news, etc. We synthesize a transient
// PortfolioHolding shape for the detail-sheet contract (quantity = 0,
// no lots) since the sheet only reads ticker/name/assetType for its identity
// row and pulls live data via fetchHoldingDetail() based on ticker.

import { useMemo, useState } from 'react';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import SparkLine from '../../components/SparkLine';
import HoldingDetailSheet from '../../components/HoldingDetailSheet';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { convertSync, normalizeCurrency } from '../../api/fxRates';
import type { WatchlistItem, PortfolioHolding } from '../../types/finance';

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', SEK: 'kr', NOK: 'kr', DKK: 'kr', CHF: 'Fr', JPY: '¥',
};
function fmt(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? '';
  const isSuffix = ['kr', 'Fr'].includes(sym);
  const num = amount.toLocaleString('fi-FI', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return isSuffix ? `${num} ${sym}` : sym ? `${sym}${num}` : `${num} ${currency}`;
}

export default function Watchlist() {
  const watchlist = useFinanceStore((s) => s.watchlist);
  const stockQuotes = useFinanceStore((s) => s.stockQuotes);
  const cryptoPrices = useFinanceStore((s) => s.cryptoPrices);
  const sparklines = useFinanceStore((s) => s.sparklines);
  const fxRates = useFinanceStore((s) => s.fxRates);
  const refreshPortfolio = useFinanceStore((s) => s.refreshPortfolio);
  const refreshing = useFinanceStore((s) => s.refreshing);
  const addItem = useFinanceStore((s) => s.addWatchlistItem);
  const updateItem = useFinanceStore((s) => s.updateWatchlistItem);
  const deleteItem = useFinanceStore((s) => s.deleteWatchlistItem);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WatchlistItem | null>(null);
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState<WatchlistItem['assetType']>('stock');
  const [targetAbove, setTargetAbove] = useState('');
  const [targetBelow, setTargetBelow] = useState('');
  const [detailHolding, setDetailHolding] = useState<PortfolioHolding | null>(null);

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setTicker('');
    setName('');
    setAssetType('stock');
    setTargetAbove('');
    setTargetBelow('');
  };

  const startEdit = (w: WatchlistItem) => {
    setEditing(w);
    setAdding(false);
    setTicker(w.ticker);
    setName(w.name);
    setAssetType(w.assetType);
    setTargetAbove(w.targetAbove != null ? String(w.targetAbove) : '');
    setTargetBelow(w.targetBelow != null ? String(w.targetBelow) : '');
  };

  const cancel = () => {
    setAdding(false);
    setEditing(null);
  };

  const save = async () => {
    if (!ticker.trim() || !name.trim()) return;
    const above = targetAbove.trim() ? parseFloat(targetAbove) : undefined;
    const below = targetBelow.trim() ? parseFloat(targetBelow) : undefined;
    if (editing) {
      await updateItem(editing.id, {
        ticker: ticker.trim(),
        name: name.trim(),
        assetType,
        targetAbove: above,
        targetBelow: below,
      });
    } else {
      await addItem({
        ticker: ticker.trim(),
        name: name.trim(),
        assetType,
        targetAbove: above,
        targetBelow: below,
      });
    }
    await refreshPortfolio();
    cancel();
  };

  // Rows with quote-derived display data.
  const rows = useMemo(() => {
    return watchlist.map((w) => {
      let price: number | null = null;
      let dayPct = 0;
      // Widened to plain string so the stock branch can swap in a native
      // currency (USD/EUR/GBP/etc.) when FX conversion to base isn't available.
      let currency: string = baseCurrency;
      let sparkline: number[] | undefined;
      let alert: 'above' | 'below' | null = null;
      if (w.assetType === 'crypto') {
        const p = cryptoPrices?.prices.find((p) => p.id === w.ticker.toLowerCase());
        if (p) {
          // Convert EUR → base for display.
          const conv = baseCurrency === 'EUR' ? p.priceEur : convertSync(p.priceEur, 'EUR', baseCurrency, fxRates);
          price = conv;
          currency = baseCurrency;
          dayPct = p.change24h ?? 0;
          sparkline = sparklines[w.ticker.toLowerCase()];
        }
      } else {
        const q = stockQuotes.find((s) => s.ticker === w.ticker.toUpperCase());
        if (q) {
          const native = normalizeCurrency(q.quote.c, q.currency);
          const conv = convertSync(q.quote.c, q.currency, baseCurrency, fxRates);
          price = conv ?? native.amount;
          currency = conv != null ? baseCurrency : native.currency;
          dayPct = q.quote.dp ?? 0;
          sparkline = sparklines[w.ticker.toUpperCase()];
        }
      }
      if (price != null) {
        if (w.targetAbove != null && price >= w.targetAbove) alert = 'above';
        else if (w.targetBelow != null && price <= w.targetBelow) alert = 'below';
      }
      return { item: w, price, currency, dayPct, sparkline, alert };
    });
  }, [watchlist, stockQuotes, cryptoPrices, sparklines, fxRates, baseCurrency]);

  const editingNow = adding || editing != null;

  return (
    <>
      <AppHeader
        title="Watchlist"
        back="/finance/portfolio"
        backLabel="Portfolio"
        showAvatar={false}
        action={
          !editingNow && (
            <>
              <button
                onClick={() => refreshPortfolio()}
                className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
                disabled={refreshing}
              >
                {refreshing ? '…' : '↻'}
              </button>
              <button
                onClick={startAdd}
                className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
              >
                + Watch
              </button>
            </>
          )
        }
      />
      <div className="space-y-3">
        {editingNow && (
          <div className="card space-y-2">
            <div className="font-heading font-semibold text-sm">
              {editing ? 'Edit Watch' : 'New Watch'}
            </div>
            <div className="flex gap-2">
              {(['stock', 'etf', 'crypto'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAssetType(t)}
                  className={`chip flex-1 ${assetType === t ? 'chip-on' : ''}`}
                >
                  {t === 'stock' ? '📈 Stock' : t === 'etf' ? '🧺 ETF' : '₿ Crypto'}
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder={
                assetType === 'crypto' ? 'CoinGecko id (e.g. bitcoin)' : 'Ticker (e.g. NVDA, CNDX.L)'
              }
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
            />
            <input
              className="input"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="text-[10px] uppercase tracking-wider text-text-muted mt-2">
              Alerts (optional)
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Alert when ≥"
                inputMode="decimal"
                value={targetAbove}
                onChange={(e) => setTargetAbove(e.target.value)}
              />
              <input
                className="input flex-1"
                placeholder="Alert when ≤"
                inputMode="decimal"
                value={targetBelow}
                onChange={(e) => setTargetBelow(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={save}>
                {editing ? 'Save' : 'Add'}
              </button>
              <button className="btn-ghost flex-1" onClick={cancel}>
                Cancel
              </button>
            </div>
            <div className="text-[10px] text-text-muted">
              Watchlist items use the same quote pipeline as your holdings.
              Alerts trigger when the price crosses your target.
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-heading font-semibold text-sm">Watching</span>
            <span className="text-[9px] uppercase tracking-wider text-text-muted">
              {rows.length} {rows.length === 1 ? 'ticker' : 'tickers'}
            </span>
          </div>
          {rows.length === 0 && !editingNow && (
            <div className="text-xs text-text-muted text-center py-6">
              No watchlist items yet. Tap + Watch to track a ticker without owning it.
            </div>
          )}
          {rows.map((r) => (
            <div key={r.item.id} className="flex items-center gap-2 py-2 border-b border-border/40 last:border-0">
              <button
                onClick={() => {
                  // Synthesize a minimal holding shape so HoldingDetailSheet
                  // can fetch fundamentals. quantity 0 is fine — the sheet
                  // doesn't read it.
                  setDetailHolding({
                    id: r.item.id,
                    ticker: r.item.ticker,
                    name: r.item.name,
                    assetType: r.item.assetType,
                    quantity: 0,
                    createdAt: r.item.createdAt,
                  });
                }}
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
              >
                <div className="flex flex-col w-[68px] min-w-0">
                  <span className="text-sm font-medium truncate">{r.item.ticker.toUpperCase()}</span>
                  <span className="text-[9px] uppercase tracking-wider text-text-muted truncate">
                    {r.item.assetType === 'etf' ? 'ETF' : r.item.assetType.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0 px-1">
                  {r.sparkline && r.sparkline.length >= 2 ? (
                    <SparkLine data={r.sparkline} height={24} trend={r.dayPct >= 0 ? 'up' : 'down'} />
                  ) : (
                    <div className="h-6" />
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm whitespace-nowrap">
                    {r.price != null ? fmt(r.price, r.currency) : '—'}
                  </span>
                  <span className={`text-[10px] whitespace-nowrap ${r.dayPct >= 0 ? 'text-success' : 'text-danger'}`}>
                    {r.dayPct >= 0 ? '↑' : '↓'} {Math.abs(r.dayPct).toFixed(2)}%
                  </span>
                  {r.alert && (
                    <span className={`text-[9px] uppercase tracking-wider px-1 py-0.5 rounded-sm border mt-0.5 ${
                      r.alert === 'above'
                        ? 'border-success/40 bg-success/10 text-success'
                        : 'border-warning/40 bg-warning/10 text-warning'
                    }`}>
                      Target {r.alert === 'above' ? '≥' : '≤'} hit
                    </span>
                  )}
                </div>
              </button>
              <RowActions
                onEdit={() => startEdit(r.item)}
                onDelete={() => deleteItem(r.item.id)}
                confirmMsg={`Stop watching ${r.item.ticker.toUpperCase()}?`}
              />
            </div>
          ))}
        </div>
      </div>
      <HoldingDetailSheet holding={detailHolding} onClose={() => setDetailHolding(null)} />
    </>
  );
}
