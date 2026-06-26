import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import StatCard from '../../components/StatCard';
import ProgressBar from '../../components/ProgressBar';
import RowActions from '../../components/RowActions';
import NewsCard from '../../components/NewsCard';
import HeatmapCalendar from '../../components/HeatmapCalendar';
import CashFlowForecastCard from '../../components/CashFlowForecastCard';
import MarketsSegment from '../../components/MarketsSegment';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { convertSync, normalizeCurrency } from '../../api/fxRates';
import { formatCurrency, formatShortDate, localDateKey } from '../../utils/formatters';
import { computeAccountBalance } from '../../lib/accountBalance';
import { portfolioCashBalance } from '../../lib/portfolioCash';

// v1.3 BUG-18 — Finance is split into two segments. "Balance" carries the
// cash-flow + net-worth + budgeting surface; "Portfolio" carries the
// investing + market surface. The former flat hierarchy (five header chips
// + everything stacked at one level) read as bloated; the segmented control
// gives the page a clear two-view spine.
// v1.4 — a third "Markets" segment joins Balance + Portfolio: a macro snapshot
// (indices, FX, rates, commodities, economic calendar). Read-only, fetched at
// runtime — no persistence.
type FinanceTab = 'balance' | 'portfolio' | 'markets';
const FINANCE_TABS: readonly FinanceTab[] = ['balance', 'portfolio', 'markets'];

export default function FinanceOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const transactions = useFinanceStore((s) => s.transactions);
  const budgetCategories = useFinanceStore((s) => s.budgetCategories);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const holdings = useFinanceStore((s) => s.holdings);
  const stockQuotes = useFinanceStore((s) => s.stockQuotes);
  const cryptoPrices = useFinanceStore((s) => s.cryptoPrices);
  const fxRates = useFinanceStore((s) => s.fxRates);
  const manualAssets = useFinanceStore((s) => s.manualAssets);
  const portfolioCashEntries = useFinanceStore((s) => s.portfolioCashEntries);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  // Active segment. Seeds from a `?tab=` query param so a deep link (e.g. a
  // market-news notification, which routes to /finance?tab=portfolio now that
  // the standalone News screen is gone) lands on the right view. The effect
  // keeps it in sync if the param changes while the screen is already mounted.
  const [tab, setTab] = useState<FinanceTab>(() => {
    const t = searchParams.get('tab');
    return t === 'portfolio' || t === 'markets' ? t : 'balance';
  });
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'portfolio' || t === 'balance' || t === 'markets') setTab(t);
  }, [searchParams]);

  // Net worth summary — MUST match the Net Worth detail screen exactly:
  //   net worth = portfolio holdings value + portfolio cash
  //               + Σ(derived account balances, liabilities already negative)
  // Two things this previously got wrong and drifted from the detail screen:
  //   1. portfolio cash was omitted (the detail screen folds it into the
  //      portfolio side), and
  //   2. account balances used the stored opening figure `a.value` instead of
  //      the DERIVED balance (opening + transaction deltas) the Account
  //      refactor introduced. We now use computeAccountBalance, same as the
  //      detail screen, so the headline number and the drill-in agree.
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
    const cashBase = portfolioCashBalance(portfolioCashEntries, baseCurrency, fxRates);
    // Signed sum of every account's derived balance — liability accounts carry
    // a negative balance by convention, so this is assets − liabilities.
    let accountsBase = 0;
    for (const a of manualAssets) {
      const native = computeAccountBalance(a, transactions, fxRates, baseCurrency).balance;
      const conv = a.currency === baseCurrency
        ? native
        : convertSync(native, a.currency, baseCurrency, fxRates);
      if (conv != null) accountsBase += conv;
    }
    return {
      total: portfolioBase + cashBase + accountsBase,
      hasData: holdings.length > 0 || manualAssets.length > 0 || portfolioCashEntries.length > 0,
    };
  }, [holdings, stockQuotes, cryptoPrices, fxRates, manualAssets, transactions, portfolioCashEntries, baseCurrency]);

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
        title={t('fin.finance')}
        action={
          // v1.3 BUG-18 — the former News / Insights / Savings / Portfolio
          // chips moved into the segmented views as labelled entry cards,
          // leaving "+ Add" as the single primary action in the header.
          <IconChip emoji="+" label={t('fin.ov.addTransaction')} accent onClick={() => navigate('/finance/add')} />
        }
      />
      <div className="space-y-3">
        {/* Segmented control — sliding cyan pill mirrors the BottomTabBar's
            active-indicator language so the two feel like one system. */}
        <div className="glass-soft rounded-pill p-1 flex relative">
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-1 rounded-pill transition-transform duration-300 ease-spring-soft"
            style={{
              width: 'calc((100% - 0.5rem) / 3)',
              transform: `translateX(${FINANCE_TABS.indexOf(tab) * 100}%)`,
              background: 'rgba(0, 212, 255, 0.14)',
              boxShadow: '0 0 0 1px rgba(0, 212, 255, 0.45)',
            }}
          />
          {FINANCE_TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              aria-current={tab === tb ? 'true' : undefined}
              className={`relative z-10 flex-1 py-2 rounded-pill text-xs font-heading font-semibold uppercase tracking-wider transition-colors duration-200 active:scale-[0.97] ${
                tab === tb ? 'text-primary' : 'text-text-muted'
              }`}
            >
              {tb === 'balance' ? t('fin.ov.balance') : tb === 'portfolio' ? t('fin.ov.portfolio') : t('fin.ov.markets')}
            </button>
          ))}
        </div>

        {tab === 'balance' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <StatCard value={formatCurrency(income)} label={t('fin.ov.income')} highlight />
              <StatCard
                value={formatCurrency(expenses)}
                label={t('fin.ov.expenses')}
                sub={income > 0 ? t('fin.ov.pctOfIncome', { pct: Math.round((expenses / income) * 100) }) : undefined}
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
                    {t('fin.ov.netWorth')}
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
                  {t('fin.ov.manage')}
                </span>
              </div>
              <div className="text-[10px] text-text-muted mt-1">
                {netWorth.hasData
                  ? t('fin.ov.netWorthSub')
                  : t('fin.ov.netWorthEmpty')}
              </div>
            </button>

            <EntryCard
              emoji="🎯"
              title={t('fin.ov.savingsBuffer')}
              sub={t('fin.ov.savingsSub')}
              onClick={() => navigate('/finance/savings')}
            />

            {/* What-If — prominent accent entry per BUG-18 */}
            <button
              onClick={() => navigate('/finance/whatif')}
              className="card w-full text-left press-spring flex items-center justify-between"
              style={{ borderColor: 'rgba(0, 212, 255, 0.4)', background: 'rgba(0, 212, 255, 0.05)' }}
            >
              <div>
                <div className="font-heading font-semibold text-sm text-primary">{t('fin.ov.runScenario')}</div>
                <div className="text-[11px] text-text-muted">{t('fin.ov.runScenarioSub')}</div>
              </div>
              <span className="text-primary text-lg" aria-hidden>→</span>
            </button>

            {/* v1.4 — projected income vs expenses from detected recurring
                patterns. Sits above Budget Breakdown: forward-looking forecast
                first, then the current-month category breakdown. */}
            <CashFlowForecastCard />

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="font-heading font-semibold text-sm">{t('fin.ov.budgetBreakdown')}</span>
                <button
                  onClick={() => navigate('/finance/budgets')}
                  className="text-[10px] uppercase tracking-wider text-primary border border-primary/40 rounded-sm px-2 py-0.5 active:bg-primary/10"
                >
                  {t('fin.ov.manage')}
                </button>
              </div>
              <div className="space-y-3">
                {budgetCategories.length === 0 && (
                  <div className="text-xs text-text-muted text-center py-3">
                    {t('fin.ov.budgetEmpty')}
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
                  <span className="font-heading font-semibold text-sm">{t('fin.ov.spendPattern')}</span>
                  <span className="text-[9px] uppercase tracking-wider text-text-muted">
                    {t('fin.ov.spendDays', { cur: baseCurrency })}
                  </span>
                </div>
                <HeatmapCalendar data={spendByDay} tint="warning" unit={baseCurrency === 'EUR' ? '€' : baseCurrency} />
                {spendByDay.size === 0 && (
                  <div className="text-[10px] text-text-muted mt-2 text-center">
                    {t('fin.ov.spendEmpty')}
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="font-heading font-semibold text-sm">{t('fin.ov.recentTx')}</span>
                <span className="text-[9px] uppercase tracking-wider text-text-muted">
                  {t('fin.ov.txTotal', { count: transactions.length })}
                </span>
              </div>
              <div className="space-y-1">
                {transactions.slice(0, 12).map((tx) => (
                  <div key={tx.id} className="flex items-center gap-2 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{tx.description}</div>
                      <div className="text-[10px] text-text-muted">{formatShortDate(tx.date)}</div>
                    </div>
                    <span
                      className={`text-sm whitespace-nowrap ${
                        tx.type === 'income' ? 'text-success' : 'text-text-muted'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '–'}
                      {formatCurrency(tx.amount).replace(/[€$]/, '€')}
                    </span>
                    <RowActions
                      onEdit={() => navigate(`/finance/add?id=${tx.id}`)}
                      onDelete={() => deleteTransaction(tx.id)}
                      confirmMsg={t('fin.ov.deleteConfirm', { name: tx.description })}
                    />
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="text-xs text-text-muted text-center py-4">{t('fin.ov.noTx')}</div>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'portfolio' && (
          <>
            <EntryCard
              emoji="📈"
              title={t('fin.ov.holdings')}
              sub={
                holdings.length > 0
                  ? t('fin.ov.holdingsPositions', { count: holdings.length })
                  : t('fin.ov.holdingsEmpty')
              }
              onClick={() => navigate('/finance/portfolio')}
            />
            <EntryCard
              emoji="👁"
              title={t('fin.ov.watchlist')}
              sub={t('fin.ov.watchlistSub')}
              onClick={() => navigate('/finance/portfolio/watchlist')}
            />
            <EntryCard
              emoji="📊"
              title={t('fin.ov.insights')}
              sub={t('fin.ov.insightsSub')}
              onClick={() => navigate('/finance/insights')}
            />

            {/* Market news — the standalone /finance/news screen was retired
                in the v1.3 scope reduction (BUG-17); this card is now its
                home, sitting with the rest of the market surface. */}
            <NewsCard />
          </>
        )}

        {tab === 'markets' && <MarketsSegment />}
      </div>
    </>
  );
}

/**
 * v1.2 follow-up — compact icon-only header chip. 32×32 square, glass-soft
 * background by default, accent variant for the primary "+ Add" action.
 * Emoji is centered (not text) so we stay flexible to whatever the user's
 * font fallback renders. aria-label carries the semantic name for screen
 * readers and long-press accessibility tooltips.
 */
function IconChip({ emoji, label, onClick, accent }: {
  emoji: string; label: string; onClick: () => void; accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-pill flex items-center justify-center text-sm press-spring ${
        accent
          ? 'border border-primary/55 text-primary'
          : 'glass-soft text-text-muted active:text-primary'
      }`}
      style={accent ? { background: 'rgba(0, 212, 255, 0.10)' } : undefined}
    >
      <span aria-hidden>{emoji}</span>
    </button>
  );
}

/**
 * v1.3 BUG-18 — labelled navigation row used inside the Balance + Portfolio
 * segments. Glass card surface, emoji + title + sub on the left, a cyan
 * chevron on the right. Replaces the cramped icon-only header chips with
 * something that actually says where it goes.
 */
function EntryCard({ emoji, title, sub, onClick }: {
  emoji: string; title: string; sub: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card w-full text-left flex items-center gap-3 active:bg-surface2/40 press-spring"
    >
      <span className="text-lg" aria-hidden>{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="font-heading font-semibold text-sm">{title}</div>
        <div className="text-[11px] text-text-muted truncate">{sub}</div>
      </div>
      <span className="text-primary text-sm" aria-hidden>→</span>
    </button>
  );
}
