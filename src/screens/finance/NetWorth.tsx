// Net worth = portfolio value + manual assets - manual liabilities.
//
// Portfolio side reuses everything the Portfolio screen computes (totals,
// FX conversion). Manual assets/liabilities are a flat list the user
// maintains here. The Savings Buffer card on top derives a runway estimate
// from cash-type assets ÷ recent monthly expense average.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { convertSync } from '../../api/fxRates';
import type { ManualAsset, ManualAssetType } from '../../types/finance';
import { LIABILITY_TYPES } from '../../types/finance';

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', SEK: 'kr', NOK: 'kr', DKK: 'kr', CHF: 'Fr', JPY: '¥',
};
const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'JPY'];

function fmt(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? '';
  const isSuffix = ['kr', 'Fr'].includes(sym);
  const num = amount.toLocaleString('fi-FI', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return isSuffix ? `${num} ${sym}` : sym ? `${sym}${num}` : `${num} ${currency}`;
}

const ASSET_META: Record<ManualAssetType, { icon: string; label: string }> = {
  cash: { icon: '💵', label: 'Cash' },
  savings: { icon: '🏦', label: 'Savings' },
  property: { icon: '🏠', label: 'Property' },
  vehicle: { icon: '🚗', label: 'Vehicle' },
  other: { icon: '📦', label: 'Other' },
  loan: { icon: '🧾', label: 'Loan' },
  credit: { icon: '💳', label: 'Credit Card' },
};

// Cash-ish asset types that count toward the savings-runway buffer. Property
// and vehicles aren't liquid; loans are subtracted from buffer separately.
const LIQUID_TYPES: ManualAssetType[] = ['cash', 'savings'];

export default function NetWorth() {
  const navigate = useNavigate();
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);
  const manualAssets = useFinanceStore((s) => s.manualAssets);
  const addAsset = useFinanceStore((s) => s.addManualAsset);
  const updateAsset = useFinanceStore((s) => s.updateManualAsset);
  const deleteAsset = useFinanceStore((s) => s.deleteManualAsset);
  const transactions = useFinanceStore((s) => s.transactions);
  const fxRates = useFinanceStore((s) => s.fxRates);
  // Portfolio value uses the same totals math the Portfolio screen does, but
  // we recompute here so this screen doesn't depend on Portfolio having been
  // visited. Cheaper than threading state. Falls back to 0 when quotes
  // haven't loaded yet.
  const portfolioValueBase = usePortfolioValueBase(baseCurrency);

  const [editing, setEditing] = useState<ManualAsset | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState<ManualAssetType>('cash');
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [notes, setNotes] = useState('');

  // Convert each manual asset's value to base currency. Liabilities are
  // negated so net worth math is a simple sum across this list + portfolio.
  const inBase = useMemo(() => {
    return manualAssets.map((a) => {
      const conv = convertSync(a.value, a.currency, baseCurrency, fxRates);
      const signed = LIABILITY_TYPES.includes(a.assetType) ? -(conv ?? 0) : conv ?? 0;
      return { ...a, base: conv == null ? null : signed };
    });
  }, [manualAssets, fxRates, baseCurrency]);

  const totalAssets = useMemo(
    () =>
      inBase
        .filter((a) => !LIABILITY_TYPES.includes(a.assetType))
        .reduce((acc, a) => acc + (a.base ?? 0), 0),
    [inBase],
  );
  const totalLiabilities = useMemo(
    () =>
      inBase
        .filter((a) => LIABILITY_TYPES.includes(a.assetType))
        .reduce((acc, a) => acc - (a.base ?? 0), 0), // re-positive
    [inBase],
  );

  const netWorth = portfolioValueBase + totalAssets - totalLiabilities;

  // Savings runway: months of expenses covered by liquid cash/savings.
  // Uses last 90d of expense transactions / 3 for monthly average.
  const monthlyExpensesAvg = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    let sum = 0;
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      if (t.date < cutoffKey) continue;
      sum += t.amount;
    }
    return sum / 3;
  }, [transactions]);

  const liquidBase = useMemo(
    () =>
      inBase
        .filter((a) => LIQUID_TYPES.includes(a.assetType))
        .reduce((acc, a) => acc + (a.base ?? 0), 0),
    [inBase],
  );
  const runwayMonths = monthlyExpensesAvg > 0 ? liquidBase / monthlyExpensesAvg : 0;
  // Industry rule of thumb: 3-6 months emergency fund.
  const runwayStatus: 'low' | 'ok' | 'good' =
    runwayMonths < 3 ? 'low' : runwayMonths < 6 ? 'ok' : 'good';

  const startAdd = () => {
    setEditing(null);
    setAdding(true);
    setName('');
    setAssetType('cash');
    setValue('');
    setCurrency(baseCurrency);
    setNotes('');
  };

  const startEdit = (a: ManualAsset) => {
    setEditing(a);
    setAdding(false);
    setName(a.name);
    setAssetType(a.assetType);
    setValue(String(a.value));
    setCurrency(a.currency);
    setNotes(a.notes ?? '');
  };

  const cancel = () => {
    setEditing(null);
    setAdding(false);
  };

  const save = async () => {
    const n = parseFloat(value);
    if (!name.trim() || isNaN(n)) return;
    if (editing) {
      await updateAsset(editing.id, {
        name: name.trim(),
        assetType,
        value: n,
        currency,
        notes: notes.trim() || undefined,
      });
    } else {
      await addAsset({
        name: name.trim(),
        assetType,
        value: n,
        currency,
        notes: notes.trim() || undefined,
      });
    }
    cancel();
  };

  const editingNow = adding || editing != null;
  const assetGroups = useMemo(() => {
    const byType: Record<ManualAssetType, ManualAsset[]> = {} as Record<ManualAssetType, ManualAsset[]>;
    for (const a of manualAssets) {
      (byType[a.assetType] ??= []).push(a);
    }
    return byType;
  }, [manualAssets]);

  return (
    <>
      <AppHeader
        title="Net Worth"
        back="/finance"
        backLabel="Finance"
        showAvatar={false}
        action={
          !editingNow && (
            <>
              <button
                onClick={() => navigate('/finance/whatif')}
                className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
              >
                🔮 What if?
              </button>
              <button
                onClick={startAdd}
                className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
              >
                + Asset
              </button>
            </>
          )
        }
      />
      <div className="space-y-3">
        {/* Total */}
        <div className="card-elevated">
          <div className="text-[10px] uppercase tracking-[0.15em] text-text-muted mb-1">
            Total Net Worth
          </div>
          <div className={`font-heading font-bold text-3xl tracking-tight ${netWorth >= 0 ? 'text-text' : 'text-danger'}`}>
            {fmt(netWorth, baseCurrency)}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/40">
            <Cell label="Portfolio" value={fmt(portfolioValueBase, baseCurrency)} />
            <Cell label="Other assets" value={fmt(totalAssets, baseCurrency)} />
            <Cell label="Liabilities" value={`−${fmt(totalLiabilities, baseCurrency)}`} tone={totalLiabilities > 0 ? 'danger' : 'default'} />
          </div>
        </div>

        {/* Savings buffer */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-semibold text-sm">Savings Buffer</span>
            <span className={`text-[9px] uppercase tracking-wider border rounded-sm px-1.5 py-0.5 ${
              runwayStatus === 'good'
                ? 'border-success/40 bg-success/5 text-success'
                : runwayStatus === 'ok'
                  ? 'border-warning/40 bg-warning/5 text-warning'
                  : 'border-danger/40 bg-danger/5 text-danger'
            }`}>
              {runwayStatus === 'good' ? 'Strong' : runwayStatus === 'ok' ? 'OK' : 'Low'}
            </span>
          </div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-heading font-bold text-xl tracking-tight">
              {runwayMonths > 0 && isFinite(runwayMonths)
                ? `${runwayMonths.toFixed(1)} months`
                : '—'}
            </span>
            <span className="text-xs text-text-muted">
              of expenses covered
            </span>
          </div>
          <div className="text-[10px] text-text-muted">
            Liquid {fmt(liquidBase, baseCurrency)} ÷ avg {fmt(monthlyExpensesAvg, baseCurrency)}/mo (last 90d).
            Target: 3-6 months.
          </div>
        </div>

        {/* Add/edit form */}
        {editingNow && (
          <div className="card space-y-2">
            <div className="font-heading font-semibold text-sm">
              {editing ? 'Edit Asset' : 'New Asset'}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(ASSET_META) as ManualAssetType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAssetType(t)}
                  className={`chip flex-col gap-0.5 py-2 ${assetType === t ? 'chip-on' : ''}`}
                >
                  <span className="text-sm">{ASSET_META[t].icon}</span>
                  <span className="text-[9px] uppercase tracking-wider">{ASSET_META[t].label}</span>
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder="Name (e.g. Nordea Savings)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Value"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
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
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={save}>
                {editing ? 'Save' : 'Add'}
              </button>
              <button className="btn-ghost flex-1" onClick={cancel}>
                Cancel
              </button>
            </div>
            <div className="text-[10px] text-text-muted">
              {LIABILITY_TYPES.includes(assetType)
                ? 'Liabilities are subtracted from net worth automatically.'
                : 'Cash + Savings count toward your savings buffer.'}
            </div>
          </div>
        )}

        {/* Asset list by type */}
        {(Object.keys(ASSET_META) as ManualAssetType[]).map((type) => {
          const items = assetGroups[type] ?? [];
          if (items.length === 0) return null;
          const meta = ASSET_META[type];
          const isLiability = LIABILITY_TYPES.includes(type);
          const groupTotal = inBase
            .filter((a) => a.assetType === type)
            .reduce((acc, a) => acc + Math.abs(a.base ?? 0), 0);
          return (
            <div key={type} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="font-heading font-semibold text-sm">
                  {meta.icon} {meta.label}
                </span>
                <span className={`text-xs ${isLiability ? 'text-danger' : 'text-text-muted'}`}>
                  {isLiability ? '−' : ''}{fmt(groupTotal, baseCurrency)}
                </span>
              </div>
              {items.map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-2 border-b border-border/40 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-[10px] text-text-muted truncate">
                      {fmt(a.value, a.currency)}{a.notes && ` · ${a.notes}`}
                    </div>
                  </div>
                  <RowActions
                    onEdit={() => startEdit(a)}
                    onDelete={() => deleteAsset(a.id)}
                    confirmMsg={`Remove ${a.name}?`}
                  />
                </div>
              ))}
            </div>
          );
        })}

        {manualAssets.length === 0 && !editingNow && (
          <div className="card">
            <div className="text-xs text-text-muted text-center py-3">
              No manual assets yet. Add cash savings, property, loans, or anything outside your stock portfolio.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`text-sm font-medium ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</div>
    </div>
  );
}

// Lightweight hook: derives portfolio value in base currency from the same
// store state Portfolio.tsx uses. Doesn't trigger any new fetches — just
// reads what's already loaded.
function usePortfolioValueBase(baseCurrency: string): number {
  const holdings = useFinanceStore((s) => s.holdings);
  const stockQuotes = useFinanceStore((s) => s.stockQuotes);
  const cryptoPrices = useFinanceStore((s) => s.cryptoPrices);
  const fxRates = useFinanceStore((s) => s.fxRates);
  return useMemo(() => {
    let total = 0;
    for (const h of holdings) {
      if (h.assetType === 'stock' || h.assetType === 'etf') {
        const q = stockQuotes.find((s) => s.ticker === h.ticker);
        if (!q) continue;
        const native = q.quote.c * h.quantity;
        const conv = convertSync(native, q.currency, baseCurrency, fxRates);
        if (conv != null) total += conv;
      } else {
        const p = cryptoPrices?.prices.find((p) => p.id === h.ticker);
        if (!p) continue;
        const nativeEur = p.priceEur * h.quantity;
        const conv = baseCurrency === 'EUR' ? nativeEur : convertSync(nativeEur, 'EUR', baseCurrency, fxRates);
        if (conv != null) total += conv;
      }
    }
    return total;
  }, [holdings, stockQuotes, cryptoPrices, fxRates, baseCurrency]);
}
