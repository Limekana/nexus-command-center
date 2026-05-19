// Tappable detail view for one holding. Slides up from the bottom on row tap.
//
// Pulls metric + recommendations + news lazily via the store's
// fetchHoldingDetail action. Cache-backed, so subsequent opens are instant.
//
// Free-tier Finnhub returns nothing useful for ETFs or international tickers.
// In that case we don't pretend — we render a friendly "Data unavailable for
// this ticker" message and keep the logo + identity header.

import { useEffect } from 'react';
import BottomSheet from './BottomSheet';
import SparkLine from './SparkLine';
import { useFinanceStore } from '../store/useFinanceStore';
import type { PortfolioHolding } from '../types/finance';

interface Props {
  holding: PortfolioHolding | null;
  onClose: () => void;
}

function fmtNum(n: number | undefined, digits = 2): string {
  if (n == null) return '—';
  return n.toLocaleString('fi-FI', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

// Compact market cap formatter (Finnhub returns millions of USD).
function fmtMarketCap(millions: number | undefined): string {
  if (millions == null) return '—';
  if (millions >= 1_000_000) return `$${(millions / 1_000_000).toFixed(2)}T`;
  if (millions >= 1_000) return `$${(millions / 1_000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
}

function relativeTime(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function HoldingDetailSheet({ holding, onClose }: Props) {
  const open = holding != null;
  const tickerKey = holding ? holding.ticker.toUpperCase() : '';
  const profile = useFinanceStore((s) => (tickerKey ? s.companyProfiles[tickerKey] : undefined));
  const metric = useFinanceStore((s) => (tickerKey ? s.stockMetrics[tickerKey] : undefined));
  const recommendations = useFinanceStore((s) =>
    tickerKey ? s.recommendations[tickerKey] : undefined,
  );
  const news = useFinanceStore((s) => (tickerKey ? s.companyNews[tickerKey] : undefined));
  const loading = useFinanceStore((s) => (tickerKey ? s.detailLoading[tickerKey] : false));
  // Use the appropriate sparkline key: stocks/etf upper-case ticker, crypto lower-case id.
  const sparkline = useFinanceStore((s) =>
    holding
      ? s.sparklines[
          holding.assetType === 'crypto' ? holding.ticker.toLowerCase() : tickerKey
        ]
      : undefined,
  );
  const stockQuote = useFinanceStore((s) =>
    holding ? s.stockQuotes.find((q) => q.ticker === holding.ticker) : undefined,
  );
  const fetchHoldingDetail = useFinanceStore((s) => s.fetchHoldingDetail);

  useEffect(() => {
    if (open && holding && (holding.assetType === 'stock' || holding.assetType === 'etf')) {
      void fetchHoldingDetail(holding.ticker);
    }
  }, [open, holding, fetchHoldingDetail]);

  if (!holding) {
    return <BottomSheet open={false} onClose={onClose}>{null}</BottomSheet>;
  }

  const isEquity = holding.assetType === 'stock' || holding.assetType === 'etf';
  const dayChange = stockQuote?.quote.dp ?? 0;
  const trend = dayChange >= 0 ? 'up' : 'down';

  // Most-recent recommendation row (Finnhub returns 1 per month).
  const latestRec = recommendations?.[0];
  const recTotal = latestRec
    ? latestRec.strongBuy + latestRec.buy + latestRec.hold + latestRec.sell + latestRec.strongSell
    : 0;

  return (
    <BottomSheet open={open} onClose={onClose} title={holding.ticker.toUpperCase()}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Identity row — logo, name, current price + day change */}
        <div className="flex items-start gap-3">
          {profile?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logo}
              alt=""
              className="w-12 h-12 rounded-md bg-surface2 object-contain border border-border/40"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-surface2 border border-border/40 flex items-center justify-center text-text-muted text-xs">
              {holding.assetType === 'crypto' ? '₿' : holding.assetType === 'etf' ? '🧺' : '📈'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-heading font-semibold text-sm truncate">
              {profile?.name || holding.name}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">
              {profile?.exchange || holding.assetType.toUpperCase()}
              {profile?.country && ` · ${profile.country}`}
              {profile?.finnhubIndustry && ` · ${profile.finnhubIndustry}`}
              {holding.sectorOverride && !profile?.finnhubIndustry && ` · ${holding.sectorOverride}`}
            </div>
          </div>
          {stockQuote && (
            <div className="text-right flex-shrink-0">
              <div className="font-heading font-bold text-base">
                {stockQuote.currency} {fmtNum(stockQuote.quote.c)}
              </div>
              <div className={`text-xs ${dayChange >= 0 ? 'text-success' : 'text-danger'}`}>
                {dayChange >= 0 ? '↑' : '↓'} {Math.abs(dayChange).toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* Sparkline */}
        {sparkline && sparkline.length >= 2 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
              7-day price
            </div>
            <SparkLine data={sparkline} height={48} trend={trend} />
          </div>
        )}

        {/* Fundamentals grid — only for equities, only if we have data */}
        {isEquity && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
              Fundamentals
            </div>
            {loading && !metric ? (
              <div className="text-xs text-text-muted text-center py-3">Loading…</div>
            ) : !metric ? (
              <div className="text-xs text-text-muted text-center py-3">
                Fundamentals unavailable for this ticker.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <Metric label="P/E (norm.)" value={fmtNum(metric.peNormalized, 1)} />
                <Metric label="P/B" value={fmtNum(metric.pbRatio, 2)} />
                <Metric label="Beta" value={fmtNum(metric.beta, 2)} />
                <Metric label="EPS (annual)" value={fmtNum(metric.epsAnnual, 2)} />
                <Metric label="ROE" value={metric.roe != null ? `${metric.roe.toFixed(1)}%` : '—'} />
                <Metric
                  label="Div yield"
                  value={metric.dividendYield != null ? `${metric.dividendYield.toFixed(2)}%` : '—'}
                />
                <Metric label="Market cap" value={fmtMarketCap(metric.marketCap)} />
                <Metric
                  label="52w range"
                  value={
                    metric.low52w != null && metric.high52w != null
                      ? `${fmtNum(metric.low52w)} – ${fmtNum(metric.high52w)}`
                      : '—'
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* Analyst recommendations bar */}
        {isEquity && latestRec && recTotal > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                Analyst consensus
              </div>
              <div className="text-[9px] text-text-muted">
                {recTotal} analysts · {latestRec.period.slice(0, 7)}
              </div>
            </div>
            <div className="flex w-full h-3 rounded-sm overflow-hidden">
              <RecSeg n={latestRec.strongBuy} total={recTotal} color="#16A34A" />
              <RecSeg n={latestRec.buy} total={recTotal} color="#3FB950" />
              <RecSeg n={latestRec.hold} total={recTotal} color="#D29922" />
              <RecSeg n={latestRec.sell} total={recTotal} color="#EF4444" />
              <RecSeg n={latestRec.strongSell} total={recTotal} color="#991B1B" />
            </div>
            <div className="flex justify-between text-[9px] mt-1 text-text-muted">
              <span>Strong Buy {latestRec.strongBuy}</span>
              <span>Buy {latestRec.buy}</span>
              <span>Hold {latestRec.hold}</span>
              <span>Sell {latestRec.sell}</span>
              <span>SS {latestRec.strongSell}</span>
            </div>
          </div>
        )}

        {/* News list */}
        {isEquity && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
              Recent news
            </div>
            {loading && !news ? (
              <div className="text-xs text-text-muted text-center py-3">Loading…</div>
            ) : !news || news.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-3">
                No recent news.
              </div>
            ) : (
              <div className="space-y-2">
                {news.slice(0, 5).map((n) => (
                  <a
                    key={n.id}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block py-2 border-b border-border/40 last:border-0 active:bg-surface2/50"
                  >
                    <div className="text-xs font-medium leading-snug line-clamp-2">
                      {n.headline}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {n.source} · {relativeTime(n.datetime)}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Crypto sheet stays minimal — Finnhub doesn't cover crypto */}
        {!isEquity && (
          <div className="text-xs text-text-muted text-center py-3">
            CoinGecko doesn't ship the deep fundamentals Finnhub provides — this sheet is informational for stocks and ETFs.
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-text-muted text-[10px] uppercase tracking-wider">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function RecSeg({ n, total, color }: { n: number; total: number; color: string }) {
  if (n <= 0) return null;
  const pct = (n / total) * 100;
  return <div style={{ width: `${pct}%`, backgroundColor: color }} />;
}
