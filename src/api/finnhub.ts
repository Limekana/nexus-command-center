import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { readCache, writeCache, shouldFetch, recordCall } from './cache';
import { getApiKey } from './keys';
import { getYahooQuote, isInternationalTicker, lastProviderErrors } from './yahoo';

// Native: direct. Web dev preview: through Vite proxy (Finnhub does send
// CORS headers for most endpoints but flaky in some setups — proxying is
// safer + symmetric with the other providers).
const BASE_URL = Capacitor.isNativePlatform()
  ? 'https://finnhub.io/api/v1'
  : '/fh/api/v1';

export interface FinnhubQuote {
  c: number;  // current price
  d: number;  // change
  dp: number; // change percent
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // previous close
}

export interface QuoteResult {
  ticker: string;
  quote: FinnhubQuote;
  currency: string;
  ageMinutes: number;
  cached: boolean;
  stale: boolean;
  source: 'finnhub' | 'yahoo';
}

async function finnhubFetch(
  ticker: string,
  opts: { force?: boolean } = {},
): Promise<QuoteResult | null> {
  const key = `finnhub_${ticker.toUpperCase()}`;
  const cached = await readCache<FinnhubQuote>(key);

  if (cached?.fresh && !opts.force) {
    return { ticker, quote: cached.data, ageMinutes: cached.ageMinutes, currency: 'USD', cached: true, stale: false, source: 'finnhub' };
  }

  const apiKey = await getApiKey('finnhub');
  if (!apiKey) {
    // "No key" isn't an error — it's the expected fallback flow (caller
    // will try Yahoo next). Pushing this to lastProviderErrors floods the
    // UI's error panel with N-tickers × 2-paths worth of meaningless rows
    // when the user simply hasn't entered a key. Just return null silently.
    if (cached) return { ticker, quote: cached.data, ageMinutes: cached.ageMinutes, currency: 'USD', cached: true, stale: true, source: 'finnhub' };
    return null;
  }

  // Quotes honor `force` from the user's ↻ tap (soft interval is short — 60s —
  // so back-to-back taps still gate, but a deliberate refresh after 1 minute
  // goes through). Daily budget + per-minute caps still apply as hard limits.
  const gate = shouldFetch('finnhub', 'finnhub', { force: opts.force, maxPerMinute: 60, subKey: ticker });
  if (!gate.allow) {
    lastProviderErrors.push({ provider: 'finnhub', ticker, message: gate.reason ?? 'rate-limited' });
    if (cached) return { ticker, quote: cached.data, ageMinutes: cached.ageMinutes, currency: 'USD', cached: true, stale: true, source: 'finnhub' };
    return null;
  }

  try {
    recordCall('finnhub', 'finnhub', ticker);
    // Authenticate via `X-Finnhub-Token` header instead of the legacy
    // `?token=` query string. Query-string secrets get logged by every proxy,
    // load balancer, browser history, and TLS-terminating MITM cert in the
    // path; headers don't end up in access logs by default.
    const { data } = await axios.get<FinnhubQuote>(`${BASE_URL}/quote`, {
      params: { symbol: ticker.toUpperCase() },
      headers: { 'X-Finnhub-Token': apiKey },
      timeout: 8000,
    });
    // Finnhub free tier returns c=0 for unsupported exchanges. Bail so the caller
    // can fall through to Yahoo.
    if (!data || typeof data.c !== 'number' || data.c === 0) {
      lastProviderErrors.push({ provider: 'finnhub', ticker, message: 'unsupported symbol (c=0)' });
      return null;
    }
    await writeCache(key, data);
    return { ticker, quote: data, currency: 'USD', ageMinutes: 0, cached: false, stale: false, source: 'finnhub' };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    lastProviderErrors.push({ provider: 'finnhub', ticker, message: msg });
    console.warn('[finnhub]', ticker, msg);
    if (cached) {
      return { ticker, quote: cached.data, ageMinutes: cached.ageMinutes, currency: 'USD', cached: true, stale: true, source: 'finnhub' };
    }
    return null;
  }
}

async function yahooFetch(
  ticker: string,
  opts: { force?: boolean } = {},
): Promise<QuoteResult | null> {
  const result = await getYahooQuote(ticker, opts);
  if (!result) return null;
  return {
    ticker,
    quote: result.quote,
    currency: result.currency,
    ageMinutes: result.ageMinutes,
    cached: result.cached,
    stale: result.stale,
    source: 'yahoo',
  };
}

export async function getQuote(
  ticker: string,
  opts: { force?: boolean } = {},
): Promise<QuoteResult | null> {
  // Route international tickers straight to Yahoo (Finnhub free tier is US-only).
  if (isInternationalTicker(ticker)) {
    return yahooFetch(ticker, opts);
  }
  // US tickers: try Finnhub first. A stale Finnhub result must NOT short-circuit
  // the Yahoo fallback (that was the cache prison). Use Finnhub only if fresh;
  // otherwise let Yahoo try for fresh; fall back to whichever stale we have if
  // both fail.
  const fh = await finnhubFetch(ticker, opts);
  if (fh && !fh.stale) return fh;

  const yh = await yahooFetch(ticker, opts);
  if (yh && !yh.stale) return yh;

  if (fh && yh) return yh.ageMinutes < fh.ageMinutes ? yh : fh;
  return yh ?? fh ?? null;
}

export async function getQuotes(
  tickers: string[],
  opts: { force?: boolean } = {},
): Promise<QuoteResult[]> {
  const results = await Promise.all(tickers.map((t) => getQuote(t, opts)));
  return results.filter((r): r is QuoteResult => r !== null);
}
