import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import StatCard from '../../components/StatCard';
import ProgressBar from '../../components/ProgressBar';
import RowActions from '../../components/RowActions';
import NewsCard from '../../components/NewsCard';
import HeatmapCalendar from '../../components/HeatmapCalendar';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { convertSync, normalizeCurrency } from '../../api/fxRates';
import { formatCurrency, formatShortDate, localDateKey } from '../../utils/formatters';
import { LIABILITY_TYPES } from '../../types/finance';

export default function FinanceOverview() {
  const navigate = useNavigate();
  const transactions = useFinanceStore((s) => s.transactions);
  const budgetCategories = useFinanceStore((s) => s.budgetCategories);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const holdings = useFinanceStore((s) => s.holdings);
  const stockQuotes = useFinanceStore((s) => s.stockQuotes);
  const cryptoPrices = useFinanceStore((s) => s.cryptoPrices);
  const fxRates = useFinanceStore((s) => s.fxRates);
  const manualAssets = useFinanceStore((s) => s.manualAssets);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  // Net worth summary — uses the same math as the Net Worth screen but
  // condensed to a single number for the overview card.
  const netWorth = useMemo(() => {
    let portfolioBase = 0;
    for (const h of holdings) {
      if (h.assetType === 'stock' || h.assetType === 'etf') {
        const q = stockQuotes.find((s) => s.ticker === h.ticker);
        if (!q) continue;
        const native = normalizeCurrency(q.quote.c * h.quantity, q.currency);
        const conv = convertSync(native.amount, native.currency, baseCurrency, fxRates);
        if (conv != null) portfolioBase += conv;
      } else {
        const p = cryptoPrices?.prices.find((p) => p.id === h.ticker);
        if (!p) continue;
        const native = p.priceEur * h.quantity;
        const conv = baseCurrency === 'EUR' ? native : convertSync(native, 'EUR', baseCurrency, fxRates);
        if (conv != null) portfolioBase += conv;
      }
    }
    let assets = 0;
    let liab = 0;
    for (const a of manualAssets) {
      const conv = convertSync(a.value, a.currency, baseCurrency, fxRates);
      if (conv == null) continue;
      if (LIABILITY_TYPES.includes(a.assetType)) liab += conv;
      else assets += conv;
    }
    return { total: portfolioBase + assets - liab, hasData: holdings.length > 0 || manualAssets.length > 0 };
  }, [holdings, stockQuotes, cryptoPrices, fxRates, manualAssets, baseCurrency]);

  const { income, expenses } = useMemo(() => {
    const now = new Date();
    let inc = 0, exp = 0;
    for (const t of transactions) {
      const d = new Date(t.date);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') exp += t.amount;
    }
    return { income: inc, expenses: exp };
  }, [transactions]);

  // Heatmap: spend-per-day in base currency. We sum expense transactions
  // and convert to base via cached FX rates. Tinted amber to match the
  // "money awareness" tone used elsewhere (warning, not danger — spending
  // isn't inherently bad, the heatmap just shows when it happened).
  const spendByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const key = localDateKey(new Date(t.date));
      // Transactions are already in user's base currency in this store.
      map.set(key, (map.get(key) ?? 0) + t.amount);
    }
    return map;
  }, [transactions]);

  const spendByCategory = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    for (const t of transactions) {
      if (t.type !== 'expense' || !t.categoryId) continue;
      const d = new Date(t.date);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
    }
    return map;
  }, [transactions]);

  return (
    <>
      <AppHeader
        title="Finance"
        action={
          <>
            <button
              onClick={() => navigate('/finance/news')}
              className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
            >
              📰 News
            </button>
            <button
              onClick={() => navigate('/finance/portfolio')}
              className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
            >
              📈 Portfolio
            </button>
            <button
              onClick={() => navigate('/finance/add')}
              className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
            >
              + Add
            </button>
          </>
        }
      />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatCard value={formatCurrency(income)} label="Income" highlight />
          <StatCard
            value={formatCurrency(expenses)}
            label="Expenses"
            sub={income > 0 ? `${Math.round((expenses / income) * 100)}% of income` : undefined}
            tone={expenses > income ? 'danger' : 'default'}
          />
        </div>

        {/* Net worth — combines portfolio + manual assets - liabilities */}
        <button
          onClick={() => navigate('/finance/networth')}
          className="card text-left w-full active:bg-surface2/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
                Net Worth
              </div>
              <div className={`font-heading font-bold text-xl ${netWorth.total >= 0 ? 'text-text' : 'text-danger'}`}>
                {netWorth.hasData
                  ? new Intl.NumberFormat('fi-FI', {
                      style: 'currency',
                      currency: baseCurrency,
                      maximumFractionDigits: 0,
                    }).format(netWorth.total)
                  : '—'}
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-primary border border-primary/40 rounded-sm px-2 py-0.5">
              Manage
            </span>
          </div>
          <div className="text-[10px] text-text-muted mt-1">
            {netWorth.hasData
              ? 'Portfolio + cash + property − loans'
              : 'Tap to add cash, property, loans and more'}
          </div>
        </button>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-heading font-semibold text-sm">Budget Breakdown</span>
            <button
              onClick={() => navigate('/finance/budgets')}
              className="text-[10px] uppercase tracking-wider text-primary border border-primary/40 rounded-sm px-2 py-0.5 active:bg-primary/10"
            >
              Manage
            </button>
          </div>
          <div className="space-y-3">
            {budgetCategories.length === 0 && (
              <div className="text-xs text-text-muted text-center py-3">
                No categories — tap Manage to add some
              </div>
            )}
            {budgetCategories.map((c) => (
              <ProgressBar
                key={c.id}
                label={`${c.icon ? c.icon + ' ' : ''}${c.name}`}
                value={spendByCategory.get(c.id) ?? 0}
                max={c.monthlyLimit}
                format={(v, m) => `${formatCurrency(v)} / ${formatCurrency(m)}`}
              />
            ))}
          </div>
        </div>

        {transactions.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="font-heading font-semibold text-sm">Spend Pattern</span>
              <span className="text-[9px] uppercase tracking-wider text-text-muted">
                365 days · {baseCurrency}
              </span>
            </div>
            <HeatmapCalendar data={spendByDay} tint="warning" unit={baseCurrency === 'EUR' ? '€' : baseCurrency} />
            {spendByDay.size === 0 && (
              <div className="text-[10px] text-text-muted mt-2 text-center">
                Log an expense to start filling this in.
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="font-heading font-semibold text-sm">Recent Transactions</span>
            <span className="text-[9px] uppercase tracking-wider text-text-muted">
              {transactions.length} total
            </span>
          </div>
          <div className="space-y-1">
            {transactions.slice(0, 12).map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{t.description}</div>
                  <div className="text-[10px] text-text-muted">{formatShortDate(t.date)}</div>
                </div>
                <span
                  className={`text-sm whitespace-nowrap ${
                    t.type === 'income' ? 'text-success' : 'text-text-muted'
                  }`}
                >
                  {t.type === 'income' ? '+' : '–'}
                  {formatCurrency(t.amount).replace(/[€$]/, '€')}
                </span>
                <RowActions
                  onEdit={() => navigate(`/finance/add?id=${t.id}`)}
                  onDelete={() => deleteTransaction(t.id)}
                  confirmMsg={`Delete "${t.description}"?`}
                />
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="text-xs text-text-muted text-center py-4">No transactions yet — tap + Add</div>
            )}
          </div>
        </div>

        <NewsCard />
      </div>
    </>
  );
}
