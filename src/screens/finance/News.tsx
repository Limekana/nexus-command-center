// Dedicated News screen at /finance/news.
//
// Two sections:
//   1. Your Holdings — flattened, deduped, time-sorted news across every
//      stock/ETF you own. Source: useFinanceStore.companyNews (populated
//      by loadCompanyNewsForHoldings on portfolio refresh).
//   2. Market — broad headlines from the marketNews state (populated by
//      getMarketNews on portfolio refresh).
//
// Tap-to-open uses Capacitor Browser on native (in-app Custom Tab) and
// window.open on web. We don't preserve scroll position because the lists
// are short (max ~30 items combined) and a fresh paint each visit is
// clearer than stale state.
//
// Refresh button forces a re-fetch via refreshPortfolio({ force: true })
// which pulls market news + re-runs per-ticker fetches. The cache layer
// inside each API absorbs the cost for tickers that are still fresh.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import { useFinanceStore } from '../../store/useFinanceStore';
import { openExternalUrl } from '../../lib/openExternal';
import type { NewsItem } from '../../api/stockDetail';

// Match NewsCard's compact relative-time format. Anchored at "now" each
// render — for stories minutes/hours old the user can see freshness at a
// glance.
function relativeTime(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function News() {
  const navigate = useNavigate();
  const holdings = useFinanceStore((s) => s.holdings);
  const companyNews = useFinanceStore((s) => s.companyNews);
  const marketNews = useFinanceStore((s) => s.marketNews);
  const refreshing = useFinanceStore((s) => s.refreshing);
  const refreshPortfolio = useFinanceStore((s) => s.refreshPortfolio);

  // Build "Your Holdings" feed: flatten per-ticker arrays, dedupe by ID,
  // sort newest-first, cap at 30. The cap exists because companyNews can
  // grow large with many holdings — past 30 items the scroll gets noisy
  // and the user is better off going to the per-holding detail sheet.
  const holdingNews = useMemo(() => {
    const ownedTickers = new Set(
      holdings
        .filter((h) => h.assetType === 'stock' || h.assetType === 'etf')
        .map((h) => h.ticker.toUpperCase()),
    );
    if (ownedTickers.size === 0) return [];
    const all: NewsItem[] = [];
    for (const t of ownedTickers) {
      const arr = companyNews[t] ?? [];
      all.push(...arr);
    }
    // Dedupe by composite key (id + url) because Finnhub IDs aren't always
    // unique across companies on the same wire story.
    const seen = new Set<string>();
    const deduped: NewsItem[] = [];
    for (const n of all) {
      const key = `${n.id}|${n.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(n);
    }
    deduped.sort((a, b) => b.datetime - a.datetime);
    return deduped.slice(0, 30);
  }, [holdings, companyNews]);

  const hasUsEquities = holdings.some((h) => h.assetType === 'stock' || h.assetType === 'etf');

  return (
    <>
      <AppHeader
        title="News"
        action={
          <>
            <button
              onClick={() => navigate('/finance')}
              className="text-xs px-2 py-1 rounded-sm border border-border text-text-muted active:text-primary active:border-primary"
            >
              ← Finance
            </button>
            <button
              onClick={() => refreshPortfolio()}
              disabled={refreshing}
              className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10 disabled:opacity-50"
            >
              {refreshing ? '…' : '↻'}
            </button>
          </>
        }
      />
      <div className="space-y-3">
        <Section title="Your Holdings" subtitle={`${holdingNews.length} stories`}>
          {!hasUsEquities && (
            <div className="text-xs text-text-muted text-center py-4">
              Add a stock or ETF holding to see news for it here.
            </div>
          )}
          {hasUsEquities && holdingNews.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">
              No recent news for your holdings. Tap ↻ to refresh.
            </div>
          )}
          {holdingNews.map((n) => (
            <NewsRow key={`h-${n.id}-${n.url}`} item={n} />
          ))}
        </Section>

        <Section title="Market" subtitle={`${marketNews.length} stories`}>
          {marketNews.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">
              No market news yet. Tap ↻ to fetch.
            </div>
          )}
          {marketNews.map((n) => (
            <NewsRow key={`m-${n.id}-${n.url}`} item={n} />
          ))}
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="sec">{title}</span>
        {subtitle && (
          <span className="text-[9px] uppercase tracking-wider text-text-muted">
            {subtitle}
          </span>
        )}
      </div>
      <div className="card space-y-2">{children}</div>
    </div>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <button
      onClick={() => openExternalUrl(item.url)}
      className="block w-full text-left py-1.5 border-b border-border/40 last:border-0 active:bg-surface2/50 rounded-sm"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium leading-snug line-clamp-2">{item.headline}</div>
          <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
            {item.ticker && (
              <span className="text-[9px] uppercase tracking-wider border border-primary/40 text-primary rounded-sm px-1 py-px">
                {item.ticker}
              </span>
            )}
            <span>{item.source}</span>
            <span>·</span>
            <span>{relativeTime(item.datetime)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
