import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../components/AppHeader';
import { Pill } from '../../components/ui/Pill';
import InsightsBreakdownSheet from '../../components/InsightsBreakdownSheet';
import RatingPill from '../../components/RatingPill';
import { useInsightsStore } from '../../store/useInsightsStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { CompositeRating } from '../../lib/insightsScore';
import type { FundamentalRating } from '../../lib/fundamentalsScore';
import { type InsightTier } from '../../lib/insightsScore';

/**
 * v1.2 Insights screen — composite Buy/Hold/Sell ratings across the user's
 * portfolio + watchlist universe. Two tabs:
 *
 *   Technical  — RSI(14) + 20/50 SMA cross + momentum + volume + sentiment.
 *                Recomputed once per calendar day.
 *   Fundamental — P/E vs sector + P/B + P/S vs sector + PEG + D/E + revenue
 *                growth + earnings surprise + analyst consensus.
 *                Recomputed once per week.
 *
 * The active tab persists via useSettingsStore.insightsTab so the choice
 * survives cold-starts and the RatingPill on Portfolio/Watchlist rows
 * reflects the same view.
 */

const TIER_FILTERS: { key: InsightTier | 'all'; labelKey: string }[] = [
  { key: 'all',          labelKey: 'fin.ins.tierAll' },
  { key: 'strong_buy',   labelKey: 'fin.ins.tierStrongBuy' },
  { key: 'buy',          labelKey: 'fin.ins.tierBuy' },
  { key: 'hold',         labelKey: 'fin.ins.tierHold' },
  { key: 'sell',         labelKey: 'fin.ins.tierSell' },
  { key: 'strong_sell',  labelKey: 'fin.ins.tierStrongSell' },
];

// Active-tab type used internally — same union as InsightsTab from settings.
type Tab = 'technical' | 'fundamental';

// Polymorphic rating type held by the breakdown-sheet state.
type BreakdownTarget =
  | { kind: 'technical'; rating: CompositeRating }
  | { kind: 'fundamental'; rating: FundamentalRating };

export default function Insights() {
  const { t } = useTranslation();
  // Both maps are read so the tab toggle is instant. Selectors are cheap
  // — they return shallow refs to existing objects.
  const technical = useInsightsStore((s) => s.ratings);
  const fundamentals = useInsightsStore((s) => s.fundamentals);
  const loading = useInsightsStore((s) => s.loading);
  const loadingFundamentals = useInsightsStore((s) => s.loadingFundamentals);
  const lastRecomputedAt = useInsightsStore((s) => s.lastRecomputedAt);
  const lastFundamentalAt = useInsightsStore((s) => s.lastFundamentalAt);
  const failedTickers = useInsightsStore((s) => s.failedTickers);
  const failedFundamentalTickers = useInsightsStore((s) => s.failedFundamentalTickers);
  const recomputeAll = useInsightsStore((s) => s.recomputeAll);
  const recomputeFundamentals = useInsightsStore((s) => s.recomputeFundamentalsAll);
  const holdings = useFinanceStore((s) => s.holdings);
  const watchlist = useFinanceStore((s) => s.watchlist);
  const activeTab = useSettingsStore((s) => s.insightsTab);
  const setActiveTab = useSettingsStore((s) => s.setInsightsTab);

  const [tierFilter, setTierFilter] = useState<InsightTier | 'all'>('all');
  const [breakdown, setBreakdown] = useState<BreakdownTarget | null>(null);

  // On mount: kick the recompute for the active tab if it's empty. The
  // store guards each sweep behind its tier window, so this is a no-op
  // when the daily/weekly sweep already ran today.
  useEffect(() => {
    if (activeTab === 'technical' && Object.keys(technical).length === 0 && !loading) {
      void recomputeAll();
    } else if (activeTab === 'fundamental' && Object.keys(fundamentals).length === 0 && !loadingFundamentals) {
      void recomputeFundamentals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Display-name lookup for either rating shape.
  const nameFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holdings) map.set(h.ticker.toUpperCase(), h.name ?? h.ticker);
    for (const w of watchlist) {
      const k = w.ticker.toUpperCase();
      if (!map.has(k)) map.set(k, w.ticker);
    }
    return map;
  }, [holdings, watchlist]);

  // Tab-specific filtered + sorted view. Each rating shape has the same
  // top-level { score, tier, breakdown, partial } fields so the row
  // component can be shared.
  const rows = useMemo(() => {
    const arr: (CompositeRating | FundamentalRating)[] =
      activeTab === 'technical' ? Object.values(technical) : Object.values(fundamentals);
    const filtered = tierFilter === 'all' ? arr : arr.filter((r) => r.tier === tierFilter);
    return filtered.sort((a, b) => b.score - a.score);
  }, [technical, fundamentals, activeTab, tierFilter]);

  const sourceMap = activeTab === 'technical' ? technical : fundamentals;
  const counts: Record<string, number> = { all: Object.keys(sourceMap).length };
  for (const tier of ['strong_buy', 'buy', 'hold', 'sell', 'strong_sell'] as InsightTier[]) {
    counts[tier] = Object.values(sourceMap).filter((r) => r.tier === tier).length;
  }

  const isLoadingActive = activeTab === 'technical' ? loading : loadingFundamentals;
  const lastAt = activeTab === 'technical' ? lastRecomputedAt : lastFundamentalAt;
  const failed = activeTab === 'technical' ? failedTickers : failedFundamentalTickers;

  function handleRefresh() {
    if (activeTab === 'technical') {
      void recomputeAll({ force: true });
    } else {
      void recomputeFundamentals({ force: true });
    }
  }

  function openBreakdown(r: CompositeRating | FundamentalRating) {
    if (activeTab === 'technical') {
      setBreakdown({ kind: 'technical', rating: r as CompositeRating });
    } else {
      setBreakdown({ kind: 'fundamental', rating: r as FundamentalRating });
    }
  }

  return (
    <>
      <AppHeader
        title={t('fin.ov.insights')}
        back="/finance"
        backLabel={t('fin.finance')}
        showAvatar={false}
        action={
          <Pill
            size="sm"
            onClick={handleRefresh}
            icon={isLoadingActive ? '⟳' : '↻'}
            disabled={isLoadingActive}
          >
            {isLoadingActive ? t('fin.ins.computing') : t('fin.ins.refresh')}
          </Pill>
        }
      />
      <div className="space-y-3">
        {/* ─── Tab toggle ──────────────────────────────────────────── */}
        <div className="glass-strong rounded-pill p-1 flex">
          <button
            type="button"
            onClick={() => void setActiveTab('technical')}
            className={`flex-1 rounded-pill text-xs font-heading font-semibold py-2 min-h-11 press-spring transition-colors duration-200 ${
              activeTab === 'technical' ? 'text-primary' : 'text-text-muted'
            }`}
            style={
              activeTab === 'technical'
                ? { background: 'rgba(0, 212, 255, 0.14)', boxShadow: '0 0 0 1px rgba(0, 212, 255, 0.55) inset' }
                : undefined
            }
            aria-pressed={activeTab === 'technical'}
          >
            {t('fin.ins.technical')}
          </button>
          <button
            type="button"
            onClick={() => void setActiveTab('fundamental')}
            className={`flex-1 rounded-pill text-xs font-heading font-semibold py-2 min-h-11 press-spring transition-colors duration-200 ${
              activeTab === 'fundamental' ? 'text-primary' : 'text-text-muted'
            }`}
            style={
              activeTab === 'fundamental'
                ? { background: 'rgba(0, 212, 255, 0.14)', boxShadow: '0 0 0 1px rgba(0, 212, 255, 0.55) inset' }
                : undefined
            }
            aria-pressed={activeTab === 'fundamental'}
          >
            {t('fin.ins.fundamental')}
          </button>
        </div>

        {/* ─── Subhead ─────────────────────────────────────────────── */}
        <div className="glass-soft rounded-xl px-4 py-3">
          <div className="text-[11px] text-text-muted leading-relaxed">
            {activeTab === 'technical' ? t('fin.ins.techDesc') : t('fin.ins.fundDesc')}
          </div>
          {lastAt && (
            <div className="text-[10px] text-text-muted/70 mt-1.5">
              {t('fin.ins.lastComputed', { time: new Date(lastAt).toLocaleTimeString() })}
              {failed.length > 0 && (
                <span className="text-warning"> · {t('fin.ins.skipped', { count: failed.length })}</span>
              )}
            </div>
          )}
        </div>

        {/* ─── Tier filter ─────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {TIER_FILTERS.map((f) => (
            <Pill
              key={f.key}
              on={tierFilter === f.key}
              onClick={() => setTierFilter(f.key)}
              className="flex-shrink-0"
            >
              {t(f.labelKey)} <span className="opacity-60">{counts[f.key] ?? 0}</span>
            </Pill>
          ))}
        </div>

        {/* ─── Rating rows ─────────────────────────────────────────── */}
        {rows.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center">
            <div className="text-xs text-text-muted">
              {isLoadingActive
                ? t('fin.ins.computingSignals')
                : Object.keys(sourceMap).length === 0
                  ? t('fin.ins.emptyUniverse')
                  : t('fin.ins.nothingIn', { filter: t(TIER_FILTERS.find((f) => f.key === tierFilter)?.labelKey ?? 'fin.ins.tierAll') })}
            </div>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {rows.map((r) => (
              <button
                key={r.ticker}
                type="button"
                onClick={() => openBreakdown(r)}
                className="glass rounded-xl p-3 w-full text-left press-spring"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold text-sm">{r.ticker}</div>
                    <div className="text-[11px] text-text-muted truncate">
                      {nameFor.get(r.ticker) ?? r.ticker}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <RatingPill ticker={r.ticker} />
                    <div className="text-[11px] font-medium text-text-muted">
                      {t('fin.ins.composite', { score: `${r.score >= 0 ? '+' : ''}${r.score.toFixed(0)}` })}
                    </div>
                  </div>
                </div>
                {/* Signal availability strip — small dots indicate which
                    signals had data. Built dynamically from the breakdown
                    object so the Technical (5) and Fundamental (8) tabs
                    both render with the right shape. */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {Object.entries(r.breakdown).map(([key, signal]) => (
                    <span
                      key={key}
                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                        !signal.available
                          ? 'text-text-muted/40 bg-surface2/30'
                          : signal.score > 5
                            ? 'text-success'
                            : signal.score < -5
                              ? 'text-danger'
                              : 'text-text-muted'
                      }`}
                      title={!signal.available ? `${key}: no data` : `${key}: ${signal.score >= 0 ? '+' : ''}${signal.score.toFixed(0)}`}
                    >
                      {shortLabel(key)}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <InsightsBreakdownSheet
        open={!!breakdown}
        onClose={() => setBreakdown(null)}
        rating={breakdown}
      />
    </>
  );
}

/** Compact 3-4 char labels for the row signal-availability strip. Falls
 *  back to the first 3 chars of the key for anything not in the map. */
function shortLabel(key: string): string {
  const map: Record<string, string> = {
    // Technical
    rsi: 'RSI',
    sma: 'SMA',
    momentum: 'Mom',
    volume: 'Vol',
    sentiment: 'News',
    // Fundamental
    peVsSector: 'P/E',
    pbRatio: 'P/B',
    psVsSector: 'P/S',
    pegRatio: 'PEG',
    debtToEquity: 'D/E',
    revenueGrowth: 'Rev',
    earningsSurprise: 'EPS',
    analystConsensus: 'Anlst',
  };
  return map[key] ?? key.slice(0, 3);
}
