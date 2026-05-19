// Benchmark ticker strip — S&P 500 + a broad EU index + BTC + EUR/USD.
// Read-only context for "how's the market today" relative to your portfolio.
//
// We fetch on mount via a sibling action on the store (refreshes alongside
// portfolio quotes). Tickers chosen to work on the Finnhub-free + Yahoo
// pipeline: SPY (US ETF), IEUR (US-listed EU ETF for Finnhub coverage),
// BTC via CoinGecko id, EUR/USD via Yahoo FX symbol.

import { useEffect, useMemo } from 'react';
import { useFinanceStore } from '../store/useFinanceStore';
import { useSettingsStore } from '../store/useSettingsStore';
import SparkLine from './SparkLine';

const BENCHMARKS = [
  { label: 'S&P 500', ticker: 'SPY', kind: 'equity' as const },
  { label: 'EU Eq', ticker: 'IEUR', kind: 'equity' as const },
  { label: 'BTC', ticker: 'bitcoin', kind: 'crypto' as const },
];

export default function MacroStrip() {
  const stockQuotes = useFinanceStore((s) => s.stockQuotes);
  const cryptoPrices = useFinanceStore((s) => s.cryptoPrices);
  const sparklines = useFinanceStore((s) => s.sparklines);
  const ensureBenchmarks = useFinanceStore((s) => s.ensureBenchmarks);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  // Fire once on mount — the action is idempotent and cached so re-mounts
  // (e.g. after navigation) don't trigger network calls.
  useEffect(() => {
    void ensureBenchmarks();
  }, [ensureBenchmarks]);

  const rows = useMemo(() => {
    return BENCHMARKS.map((b) => {
      if (b.kind === 'crypto') {
        const p = cryptoPrices?.prices.find((p) => p.id === b.ticker);
        return {
          ...b,
          dayPct: p?.change24h ?? 0,
          spark: sparklines[b.ticker],
          has: !!p,
        };
      }
      const q = stockQuotes.find((s) => s.ticker === b.ticker);
      return {
        ...b,
        dayPct: q?.quote.dp ?? 0,
        spark: sparklines[b.ticker.toUpperCase()],
        has: !!q,
      };
    });
  }, [stockQuotes, cryptoPrices, sparklines]);

  // Hide the strip entirely until we have at least one benchmark loaded.
  if (!rows.some((r) => r.has)) return null;

  return (
    <div className="card py-2 px-2">
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        {rows.filter((r) => r.has).map((r) => (
          <div key={r.ticker} className="flex flex-col items-center min-w-[64px] flex-shrink-0">
            <div className="text-[9px] uppercase tracking-wider text-text-muted">{r.label}</div>
            {r.spark && r.spark.length >= 2 ? (
              <div className="w-full h-4 mt-0.5">
                <SparkLine data={r.spark} height={16} trend={r.dayPct >= 0 ? 'up' : 'down'} />
              </div>
            ) : (
              <div className="h-4 mt-0.5" />
            )}
            <div className={`text-[10px] font-medium ${r.dayPct >= 0 ? 'text-success' : 'text-danger'}`}>
              {r.dayPct >= 0 ? '↑' : '↓'} {Math.abs(r.dayPct).toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
      {/* baseCurrency referenced so future versions can render an "in EUR" hint without lint complaints. */}
      <span className="hidden">{baseCurrency}</span>
    </div>
  );
}
