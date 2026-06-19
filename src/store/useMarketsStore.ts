// Markets store — v1.4. In-memory only (no Dexie, no cloud). Holds the macro
// snapshot rendered by the Finance → Markets segment: global indices, EUR FX
// pairs, central-bank / benchmark rates, and commodities. Data is fetched at
// runtime from Yahoo Finance (via the existing CapacitorHttp-backed layer) and
// the ECB Data Portal. Refreshes are gated to once per 5 minutes.

import { create } from 'zustand';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { getYahooQuote, getYahooSparkline } from '../api/yahoo';

export interface MarketIndex {
  ticker: string;
  label: string;
  price: number;
  changePercent: number;
  spark: number[];
}

export interface FxRateRow {
  pair: string; // 'EUR/USD'
  rate: number;
  changePercent: number;
  spark: number[];
}

export interface MacroRate {
  label: string; // 'ECB Deposit Rate'
  value: number; // percentage, e.g. 3.25
  /** Upper bound of the gauge's range, for the dot-fill proportion. */
  rangeMax: number;
}

export interface Commodity {
  label: string; // 'Brent'
  price: number;
  currency: string;
  changePercent: number;
  spark: number[];
}

interface MarketsState {
  indices: MarketIndex[];
  fxRates: FxRateRow[];
  macroRates: MacroRate[];
  commodities: Commodity[];
  lastFetched: number | null;
  isLoading: boolean;
  /** True when the last refresh failed but we're showing cached data. */
  stale: boolean;
  error: string | null;
  fetchMarkets: (opts?: { force?: boolean }) => Promise<void>;
}

const FRESH_MS = 5 * 60 * 1000;

const INDEX_DEFS: Array<{ ticker: string; label: string }> = [
  { ticker: '^GSPC', label: 'S&P 500' },
  { ticker: '^IXIC', label: 'Nasdaq' },
  { ticker: '^GDAXI', label: 'DAX' },
  { ticker: '^OMXH25', label: 'OMX Helsinki' },
];

const FX_DEFS: Array<{ ticker: string; pair: string }> = [
  { ticker: 'EURUSD=X', pair: 'EUR/USD' },
  { ticker: 'EURSEK=X', pair: 'EUR/SEK' },
  { ticker: 'EURNOK=X', pair: 'EUR/NOK' },
  { ticker: 'EURGBP=X', pair: 'EUR/GBP' },
];

const COMMODITY_DEFS: Array<{ ticker: string; label: string }> = [
  { ticker: 'BZ=F', label: 'Brent Crude' },
  { ticker: 'GC=F', label: 'Gold' },
];

// ── ECB Data Portal — deposit facility rate + 10Y Bund yield ───────────────
// Free REST, no auth. Native hits the host directly (CapacitorHttp bypasses
// CORS); web dev goes through the /ecb-api Vite proxy. Best-effort: any failure
// just omits that rate row.
const ECB_BASE = Capacitor.isNativePlatform()
  ? 'https://data-api.ecb.europa.eu'
  : '/ecb-api';

const ECB_SERIES = {
  deposit: '/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?format=jsondata&lastNObservations=1',
  bund: '/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y?format=jsondata&lastNObservations=1',
};

async function fetchEcbLatest(pathSuffix: string): Promise<number | null> {
  const url = `${ECB_BASE}${pathSuffix}`;
  try {
    let body: unknown;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.request({
        method: 'GET',
        url,
        headers: { Accept: 'application/json' },
        connectTimeout: 8000,
        readTimeout: 8000,
      });
      if (res.status >= 400) return null;
      body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } else {
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) return null;
      body = await resp.json();
    }
    // jsondata shape: dataSets[0].series[<key>].observations[<idx>][0] = value.
    const data = body as {
      dataSets?: Array<{ series?: Record<string, { observations?: Record<string, Array<number | null>> }> }>;
    };
    const series = data.dataSets?.[0]?.series;
    if (!series) return null;
    const firstSeries = series[Object.keys(series)[0]];
    const obs = firstSeries?.observations;
    if (!obs) return null;
    const firstObs = obs[Object.keys(obs)[0]];
    const value = firstObs?.[0];
    return typeof value === 'number' && isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export const useMarketsStore = create<MarketsState>((set, get) => ({
  indices: [],
  fxRates: [],
  macroRates: [],
  commodities: [],
  lastFetched: null,
  isLoading: false,
  stale: false,
  error: null,

  async fetchMarkets(opts = {}) {
    const { lastFetched, isLoading } = get();
    if (isLoading) return;
    if (!opts.force && lastFetched != null && Date.now() - lastFetched < FRESH_MS) {
      return; // still fresh — no-op
    }
    set({ isLoading: true, error: null });

    // Helper: one row = quote + sparkline. Returns null on failure so the row
    // is simply omitted rather than crashing the whole refresh.
    const loadQuote = async (ticker: string) => {
      const [q, spark] = await Promise.all([
        getYahooQuote(ticker, { force: opts.force }).catch(() => null),
        getYahooSparkline(ticker, { force: opts.force }).catch(() => null),
      ]);
      if (!q) return null;
      return { quote: q.quote, currency: q.currency, spark: spark ?? [] };
    };

    try {
      const [indexRows, fxRows, commodityRows, treasury, ecbDeposit, ecbBund] = await Promise.all([
        Promise.all(INDEX_DEFS.map(async (d) => {
          const r = await loadQuote(d.ticker);
          return r ? { ticker: d.ticker, label: d.label, price: r.quote.c, changePercent: r.quote.dp, spark: r.spark } : null;
        })),
        Promise.all(FX_DEFS.map(async (d) => {
          const r = await loadQuote(d.ticker);
          return r ? { pair: d.pair, rate: r.quote.c, changePercent: r.quote.dp, spark: r.spark } : null;
        })),
        Promise.all(COMMODITY_DEFS.map(async (d) => {
          const r = await loadQuote(d.ticker);
          return r ? { label: d.label, price: r.quote.c, currency: r.currency || 'USD', changePercent: r.quote.dp, spark: r.spark } : null;
        })),
        loadQuote('^TNX'),
        fetchEcbLatest(ECB_SERIES.deposit),
        fetchEcbLatest(ECB_SERIES.bund),
      ]);

      const indices = indexRows.filter((x): x is MarketIndex => x != null);
      const fxRates = fxRows.filter((x): x is FxRateRow => x != null);
      const commodities = commodityRows.filter((x): x is Commodity => x != null);

      const macroRates: MacroRate[] = [];
      if (ecbDeposit != null) macroRates.push({ label: 'ECB Deposit Rate', value: ecbDeposit, rangeMax: 5 });
      if (ecbBund != null) macroRates.push({ label: '10Y Bund Yield', value: ecbBund, rangeMax: 5 });
      if (treasury) macroRates.push({ label: 'US 10Y Treasury', value: treasury.quote.c, rangeMax: 6 });

      const gotAnything = indices.length || fxRates.length || commodities.length || macroRates.length;

      set({
        indices,
        fxRates,
        commodities,
        macroRates,
        isLoading: false,
        lastFetched: gotAnything ? Date.now() : get().lastFetched,
        stale: !gotAnything,
        error: gotAnything ? null : 'Could not reach market data sources',
      });
    } catch (e) {
      set({ isLoading: false, stale: true, error: (e as Error).message || 'Market refresh failed' });
    }
  },
}));
