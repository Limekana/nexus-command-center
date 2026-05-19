// Purchase lots manager. One sub-screen per holding. Shows all lots in
// reverse-chronological order, lets the user add new buys, edit existing
// ones, or delete. Totals across lots are derived live (sum qty, weighted
// avg price per currency); the store keeps the holding row's cached
// aggregates in sync via recomputeHoldingAggregates() on every CRUD call.

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import { useFinanceStore } from '../../store/useFinanceStore';
import type { PortfolioLot } from '../../types/finance';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'JPY'];

function formatNumber(n: number, max = 4): string {
  return n.toLocaleString('fi-FI', { maximumFractionDigits: max, minimumFractionDigits: 0 });
}

export default function ManageLots() {
  const { id: holdingId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const holding = useFinanceStore((s) => s.holdings.find((h) => h.id === holdingId));
  const allLots = useFinanceStore((s) => s.portfolioLots);
  const addLot = useFinanceStore((s) => s.addLot);
  const updateLot = useFinanceStore((s) => s.updateLot);
  const deleteLot = useFinanceStore((s) => s.deleteLot);
  const refreshPortfolio = useFinanceStore((s) => s.refreshPortfolio);

  const lots = useMemo(
    () =>
      allLots
        .filter((l) => l.holdingId === holdingId)
        // Most-recent purchase at top so the chronology reads naturally.
        .sort((a, b) => (b.purchaseDate ?? b.createdAt).localeCompare(a.purchaseDate ?? a.createdAt)),
    [allLots, holdingId],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  if (!holding) {
    return (
      <>
        <AppHeader title="Purchases" back="/finance/portfolio/manage" backLabel="Holdings" showAvatar={false} />
        <div className="text-xs text-text-muted text-center py-6">
          Holding not found. <button className="text-primary" onClick={() => navigate('/finance/portfolio/manage')}>Go back</button>.
        </div>
      </>
    );
  }

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setQty('');
    setPrice('');
    // Default currency = last-used on this holding, falling back to EUR.
    setCurrency(lots[0]?.costCurrency ?? 'EUR');
    setDate(new Date().toISOString().slice(0, 10));
    setNotes('');
  };

  const startEdit = (lot: PortfolioLot) => {
    setAdding(false);
    setEditingId(lot.id);
    setQty(String(lot.quantity));
    setPrice(String(lot.costPerUnit));
    setCurrency(lot.costCurrency);
    setDate(lot.purchaseDate ?? new Date().toISOString().slice(0, 10));
    setNotes(lot.notes ?? '');
  };

  const cancel = () => {
    setEditingId(null);
    setAdding(false);
  };

  const save = async () => {
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (!q || q <= 0 || isNaN(p) || p < 0) return;
    if (editingId) {
      await updateLot(editingId, {
        quantity: q,
        costPerUnit: p,
        costCurrency: currency,
        purchaseDate: date || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      await addLot({
        holdingId: holding.id,
        quantity: q,
        costPerUnit: p,
        costCurrency: currency,
        purchaseDate: date || undefined,
        notes: notes.trim() || undefined,
      });
    }
    await refreshPortfolio();
    cancel();
  };

  const onDelete = async (lotId: string) => {
    await deleteLot(lotId);
    await refreshPortfolio();
  };

  // Per-currency totals for the summary card. If the user buys in mixed
  // currencies (e.g. some EUR, some USD), we surface each separately so the
  // math is legible instead of fudging an FX conversion here. The Portfolio
  // screen does the cross-currency aggregation via fxRates.
  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, { qty: number; cost: number }>();
    for (const l of lots) {
      const e = map.get(l.costCurrency) ?? { qty: 0, cost: 0 };
      e.qty += l.quantity;
      e.cost += l.quantity * l.costPerUnit;
      map.set(l.costCurrency, e);
    }
    return Array.from(map.entries()).map(([cur, v]) => ({
      currency: cur,
      qty: v.qty,
      cost: v.cost,
      avgPrice: v.qty > 0 ? v.cost / v.qty : 0,
    }));
  }, [lots]);

  const editingNow = adding || editingId != null;

  return (
    <>
      <AppHeader
        title={holding.ticker.toUpperCase()}
        back="/finance/portfolio/manage"
        backLabel="Holdings"
        showAvatar={false}
        action={
          !editingNow && (
            <button
              onClick={startAdd}
              className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
            >
              + Purchase
            </button>
          )
        }
      />
      <div className="space-y-3">
        {/* Summary — totals across all lots, per-currency. */}
        <div className="card-elevated">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
                {holding.name}
              </div>
              <div className="font-heading font-semibold text-sm">
                {holding.assetType === 'crypto' ? '₿' : holding.assetType === 'etf' ? '🧺' : '📈'} {holding.ticker.toUpperCase()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-text-muted">Total Units</div>
              <div className="font-heading font-bold text-lg">{formatNumber(holding.quantity)}</div>
            </div>
          </div>
          {totalsByCurrency.length === 0 && (
            <div className="text-xs text-text-muted">No purchases recorded yet.</div>
          )}
          {totalsByCurrency.map((t) => (
            <div key={t.currency} className="flex items-center justify-between text-xs py-1 border-t border-border/40 first:border-t-0 pt-1">
              <span className="text-text-muted">
                Avg cost <span className="text-text font-medium">
                  {formatNumber(t.avgPrice)} {t.currency}
                </span>
              </span>
              <span className="text-text-muted">
                Cost basis <span className="text-text font-medium">
                  {formatNumber(t.cost, 2)} {t.currency}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Add/Edit lot form */}
        {editingNow && (
          <div className="card space-y-2">
            <div className="font-heading font-semibold text-sm">
              {editingId ? 'Edit Purchase' : 'New Purchase'}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Quantity"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
              />
              <input
                className="input flex-1"
                placeholder="Price per unit"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <select
                className="input max-w-[88px]"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <input
              className="input"
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={save}>
                {editingId ? 'Save' : 'Add Purchase'}
              </button>
              <button className="btn-ghost flex-1" onClick={cancel}>
                Cancel
              </button>
            </div>
            <div className="text-[10px] text-text-muted">
              Cost is stored in the currency you paid in. The Portfolio screen
              converts everything to your base currency at quote time.
            </div>
          </div>
        )}

        {/* Lots list */}
        <div className="card">
          <div className="font-heading font-semibold text-sm mb-2">Purchase History</div>
          {lots.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">
              No purchases yet — tap + Purchase to record one
            </div>
          )}
          {lots.map((lot) => (
            <div key={lot.id} className="flex items-center gap-2 py-2 border-b border-border/40 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {formatNumber(lot.quantity)} units @ {formatNumber(lot.costPerUnit)} {lot.costCurrency}
                </div>
                <div className="text-[10px] text-text-muted">
                  {lot.purchaseDate ?? lot.createdAt.slice(0, 10)}
                  {' · '}{formatNumber(lot.quantity * lot.costPerUnit, 2)} {lot.costCurrency} total
                  {lot.notes && <> · {lot.notes}</>}
                </div>
              </div>
              <RowActions
                onEdit={() => startEdit(lot)}
                onDelete={() => onDelete(lot.id)}
                confirmMsg="Delete this purchase?"
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
