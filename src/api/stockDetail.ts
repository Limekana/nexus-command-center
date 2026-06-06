// Tier 2 Finnhub endpoints — fundamentals, analyst recs, news, earnings,
// dividends. All fetched lazily on user interaction (detail sheet) except
// earnings calendar + dividends which are pulled with the main portfolio
// refresh because they drive standalone cards on the Portfolio screen.
//
// All cache TTLs are conservative since these data sources don't tick in
// real time. v1.2 — re-tiered against `lib/insightsCache.ts` for the
// Insights three-tier architecture:
//   /stock/metric          — 7d  (Fundamental tier — quarterly cadence)
//   /stock/recommendation  — 7d  (Fundamental tier — monthly trend data)
//   /stock/earnings        — 7d  (Fundamental tier — quarterly actuals)
//   /company-news          — 6h  (Technical/sentiment tier — newsroom rhythm)
//   /calendar/earnings     — 12h (Upcoming events — not Insights input)
//   /stock/dividend        — 7d  (events scheduled months ahead)
//
// Free-tier behavior for non-US tickers: most of these return empty arrays
// or empty objects. We treat that as "no data" and surface a friendly
// fallback in the UI rather than an error.

import { db } from '../db/database';
import { getApiKey } from './keys';
import { shouldFetch, recordCall } from './cache';
import { lastProviderErrors, isInternationalTicker, readChartMeta } from './yahoo';
import { finnhubGet } from './finnhub';
import { buildRelevanceCheck, isNewsRelevant } from '../lib/newsRelevance';
import {
  getYahooMetric,
  getYahooEarnings,
  getYahooDividendApproximation,
  getYahooNews,
  getYahooRecommendations,
  getYahooEarningsHistory,
} from './yahooFundamentals';

// v1.2.1 — BASE_URL no longer needed; finnhubGet owns URL + native/web routing.

// ── Types ─────────────────────────────────────────────────────────────────

export interface StockMetric {
  ticker: string;
  // Subset of Finnhub /stock/metric → metric. Only the ones we render.
  peNormalized?: number;     // metric: 'peNormalizedAnnual'
  pbRatio?: number;          // metric: 'pbAnnual'
  beta?: number;             // metric: 'beta'
  high52w?: number;          // '52WeekHigh'
  low52w?: number;           // '52WeekLow'
  marketCap?: number;        // 'marketCapitalization' — millions of USD
  dividendYield?: number;    // 'dividendYieldIndicatedAnnual' — percent
  epsAnnual?: number;        // 'epsBasicExclExtraItemsAnnual'
  roe?: number;              // 'roeRfy' — percent
  // v1.2 — additional fields surfaced for the Fundamental signal engine.
  // All optional because Finnhub's free tier returns 'NA' / missing for
  // some symbols; the engine treats undefined as "skip this signal".
  psRatio?: number;          // metric: 'psAnnual' — price-to-sales
  pegRatio?: number;         // metric: 'pegRatio' / 'pegRatioBasicExclExtraTTM'
  debtToEquity?: number;     // metric: 'totalDebt/totalEquityAnnual'
  revenueGrowthYoy?: number; // metric: 'revenueGrowthTTMYoy' — percent
}

export interface Recommendation {
  period: string; // YYYY-MM-DD (first of month)
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface NewsItem {
  id: number;
  ticker?: string; // not provided by per-company endpoint; we stamp it
  datetime: number; // unix seconds
  headline: string;
  source: string;
  summary?: string;
  url: string;
  image?: string;
}

export interface EarningsEvent {
  symbol: string;
  date: string; // YYYY-MM-DD
  epsEstimate?: number;
  epsActual?: number;
  hour?: 'bmo' | 'amc' | 'dmh' | ''; // before market open, after market close, during market hours
  quarter?: number;
  year?: number;
}

export interface DividendEvent {
  symbol: string;
  date: string;   // ex-div date YYYY-MM-DD
  amount: number; // per-share, native currency
  currency: string;
  payDate?: string;
  recordDate?: string;
}

// ── Cache helpers (parallel to the standard 60min cache) ─────────────────

async function readCacheWithTTL<T>(key: string, ttlMs: number): Promise<T | null> {
  const entry = await db.apiCache.get(key);
  if (!entry) return null;
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  if (age > ttlMs) return null;
  try {
    return JSON.parse(entry.data) as T;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  const now = new Date();
  await db.apiCache.put({
    cacheKey: key,
    data: JSON.stringify(data),
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  });
}

// ── /stock/metric ─────────────────────────────────────────────────────────

// v1.2 — promoted to weekly under the Fundamental tier.
const METRIC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getStockMetric(ticker: string): Promise<StockMetric | null> {
  const key = `metric_${ticker.toUpperCase()}`;
  const cached = await readCacheWithTTL<StockMetric>(key, METRIC_TTL_MS);
  if (cached) return cached;
  // International tickers and no-key users skip Finnhub and try Yahoo's
  // quoteSummary instead — same shape, global coverage, no key required.
  if (isInternationalTicker(ticker)) return getYahooMetric(ticker);
  const apiKey = await getApiKey('finnhub');
  if (!apiKey) return getYahooMetric(ticker);
  const gate = shouldFetch('finnhub-metric', 'finnhub', { force: false, maxPerMinute: 60, subKey: ticker });
  if (!gate.allow) return getYahooMetric(ticker);
  try {
    recordCall('finnhub-metric', 'finnhub', ticker);
    // v1.2.1 — finnhubGet for native CapacitorHttp routing.
    const data = await finnhubGet<{ metric?: Record<string, unknown> }>(
      '/stock/metric',
      { symbol: ticker.toUpperCase(), metric: 'all' },
      apiKey,
      { timeout: 10000 },
    );
    const m = (data?.metric ?? {}) as Record<string, unknown>;
    // Finnhub returns 'NA' as the string for missing fields on some plans.
    const num = (v: unknown): number | undefined =>
      typeof v === 'number' && isFinite(v) ? v : undefined;
    const result: StockMetric = {
      ticker: ticker.toUpperCase(),
      peNormalized: num(m.peNormalizedAnnual),
      pbRatio: num(m.pbAnnual),
      beta: num(m.beta),
      high52w: num(m['52WeekHigh']),
      low52w: num(m['52WeekLow']),
      marketCap: num(m.marketCapitalization),
      dividendYield: num(m.dividendYieldIndicatedAnnual),
      epsAnnual: num(m.epsBasicExclExtraItemsAnnual),
      roe: num(m.roeRfy),
      // v1.2 — Fundamental signal inputs. Finnhub's metric blob carries
      // these on most US tickers; we ride the existing 24h cache (will
      // get re-tiered to weekly by the cache architecture pass).
      psRatio: num(m.psAnnual),
      // PEG: Finnhub publishes both `pegRatioBasicExclExtraTTM` and the
      // legacy `pegRatio`. Prefer the explicit TTM, fall back to legacy.
      pegRatio: num(m['pegRatioBasicExclExtraTTM']) ?? num(m.pegRatio),
      debtToEquity: num(m['totalDebt/totalEquityAnnual']),
      revenueGrowthYoy: num(m.revenueGrowthTTMYoy),
    };
    // Free-tier Finnhub returns an empty `metric` object for some symbols;
    // detect that and fall through to Yahoo. v1.2 — guard now ignores
    // `ticker` by name instead of by iteration index, so the detection
    // doesn't silently break when more fields are added to StockMetric.
    const numericValues = Object.entries(result)
      .filter(([k]) => k !== 'ticker')
      .map(([, v]) => v);
    if (numericValues.every((v) => v == null)) {
      return getYahooMetric(ticker);
    }
    await writeCache(key, result, METRIC_TTL_MS);
    return result;
  } catch (e) {
    lastProviderErrors.push({ provider: 'finnhub', ticker, message: `metric: ${(e as Error).message}` });
    return getYahooMetric(ticker);
  }
}

// ── /stock/recommendation ─────────────────────────────────────────────────

// v1.2 — promoted to weekly under the Fundamental tier.
const REC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getRecommendations(ticker: string): Promise<Recommendation[]> {
  const key = `rec_${ticker.toUpperCase()}`;
  const cached = await readCacheWithTTL<Recommendation[]>(key, REC_TTL_MS);
  if (cached) return cached;
  // v1.2 follow-up — BUG-8. International tickers fall through to Yahoo's
  // recommendationTrend module (Finnhub free tier is US-only). Previously
  // this just returned [], permanently disabling the analystConsensus signal
  // for 12 of 16 holdings in the user's portfolio.
  if (isInternationalTicker(ticker)) return getYahooRecommendations(ticker);
  const apiKey = await getApiKey('finnhub');
  if (!apiKey) return getYahooRecommendations(ticker);
  const gate = shouldFetch('finnhub-rec', 'finnhub', { force: false, maxPerMinute: 60, subKey: ticker });
  if (!gate.allow) return getYahooRecommendations(ticker);
  try {
    recordCall('finnhub-rec', 'finnhub', ticker);
    // v1.2.1 — finnhubGet for native CapacitorHttp routing.
    const data = await finnhubGet<Recommendation[]>(
      '/stock/recommendation',
      { symbol: ticker.toUpperCase() },
      apiKey,
      { timeout: 10000 },
    );
    const arr = Array.isArray(data) ? data : [];
    // Newest first (Finnhub returns reverse-chronological already, but be safe).
    arr.sort((a, b) => b.period.localeCompare(a.period));
    // BUG-8 — if Finnhub returns empty (free-tier coverage gap on a
    // technically-US-listed ADR or low-coverage stock), fall through to
    // Yahoo just like the metric path does. Cache only on success so a
    // transient miss doesn't lock us out for a week.
    if (arr.length === 0) return getYahooRecommendations(ticker);
    await writeCache(key, arr, REC_TTL_MS);
    return arr;
  } catch (e) {
    lastProviderErrors.push({ provider: 'finnhub', ticker, message: `rec: ${(e as Error).message}` });
    return getYahooRecommendations(ticker);
  }
}

// ── /company-news ─────────────────────────────────────────────────────────

const NEWS_TTL_MS = 6 * 60 * 60 * 1000;

export async function getCompanyNews(ticker: string): Promise<NewsItem[]> {
  const key = `news_${ticker.toUpperCase()}`;
  const cached = await readCacheWithTTL<NewsItem[]>(key, NEWS_TTL_MS);
  if (cached) return cached;
  // International / no-key: Yahoo search has global news coverage and doesn't
  // need an API key.
  if (isInternationalTicker(ticker)) return getYahooNews(ticker);
  const apiKey = await getApiKey('finnhub');
  if (!apiKey) return getYahooNews(ticker);
  const gate = shouldFetch('finnhub-news', 'finnhub', { force: false, maxPerMinute: 60, subKey: ticker });
  if (!gate.allow) return getYahooNews(ticker);
  // Finnhub requires from/to date params. Pull last 7 days.
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  try {
    recordCall('finnhub-news', 'finnhub', ticker);
    // v1.2.1 — finnhubGet for native CapacitorHttp routing.
    const data = await finnhubGet<NewsItem[]>(
      '/company-news',
      {
        symbol: ticker.toUpperCase(),
        from: fmt(from),
        to: fmt(to),
      },
      apiKey,
      { timeout: 10000 },
    );
    const arr = Array.isArray(data) ? data : [];
    // BUG-3 defense in depth: Finnhub's /company-news is usually reliable, but
    // edge cases have surfaced unrelated stories (the reported Trump/sanctuary-
    // city story mis-tagged as Nordea was actually from the Yahoo path, but
    // we apply the same filter here as belt-and-suspenders so any future
    // Finnhub coverage drift can't slip junk through). companyName comes
    // from the Yahoo chart-meta cache populated by every quote refresh.
    const meta = await readChartMeta(ticker);
    const check = buildRelevanceCheck(ticker, meta?.longName);
    let rejected = 0;
    // Stamp ticker (Finnhub doesn't include it in the per-company response),
    // filter by relevance, sort newest first, and trim to 10 (more than that
    // is doom-scroll noise).
    const stamped: NewsItem[] = arr
      .map((n) => ({ ...n, ticker: ticker.toUpperCase() }))
      .filter((item) => {
        const ok = isNewsRelevant(item, check);
        if (!ok) rejected += 1;
        return ok;
      })
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 10);
    if (rejected > 0) {
      console.debug(
        `[finnhub news] ${ticker}: filtered ${rejected} off-topic ` +
          `story/stories (check: base=${check.tickerBase} key=${check.companyKey ?? '?'})`,
      );
    }
    // If Finnhub returned an empty news list (rate-limited, no coverage, or
    // everything got filtered as off-topic), try Yahoo instead. Yahoo applies
    // its own relevance filter inside getYahooNews so this still respects
    // the BUG-3 contract — we won't surface junk from the fallback.
    if (stamped.length === 0) return getYahooNews(ticker);
    await writeCache(key, stamped, NEWS_TTL_MS);
    return stamped;
  } catch (e) {
    lastProviderErrors.push({ provider: 'finnhub', ticker, message: `news: ${(e as Error).message}` });
    return getYahooNews(ticker);
  }
}

// ── /calendar/earnings ────────────────────────────────────────────────────

const EARNINGS_TTL_MS = 12 * 60 * 60 * 1000;

interface EarningsCalendarResponse {
  earningsCalendar?: EarningsEvent[];
}

export async function getEarningsCalendar(tickers: string[]): Promise<EarningsEvent[]> {
  if (!tickers.length) return [];
  const cacheKey = `earnings_${tickers.map((t) => t.toUpperCase()).sort().join(',')}`;
  const cached = await readCacheWithTTL<EarningsEvent[]>(cacheKey, EARNINGS_TTL_MS);
  if (cached) return cached;

  // Partition: US tickers can use Finnhub's /calendar/earnings, international
  // ones go to Yahoo's per-ticker calendarEvents.
  const usTickers = tickers.filter((t) => !isInternationalTicker(t));
  const intlTickers = tickers.filter((t) => isInternationalTicker(t));
  const apiKey = await getApiKey('finnhub');

  // Date range: last 7 days (so we still see "just reported" events) to next 60.
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setDate(to.getDate() + 60);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const allEvents: EarningsEvent[] = [];

  // US: Finnhub if key, else Yahoo. Yahoo only returns next 1-2 events but
  // that's the most-relevant horizon anyway.
  if (apiKey) {
    for (const ticker of usTickers) {
      const gate = shouldFetch('finnhub-earnings', 'finnhub', { force: false, maxPerMinute: 60, subKey: ticker });
      if (!gate.allow) {
        const fallback = await getYahooEarnings(ticker);
        allEvents.push(...fallback);
        continue;
      }
      try {
        recordCall('finnhub-earnings', 'finnhub', ticker);
        // v1.2.1 — finnhubGet for native CapacitorHttp routing.
        const data = await finnhubGet<EarningsCalendarResponse>(
          '/calendar/earnings',
          { from: fmt(from), to: fmt(to), symbol: ticker.toUpperCase() },
          apiKey,
          { timeout: 10000 },
        );
        const events = data?.earningsCalendar ?? [];
        if (events.length === 0) {
          // Free-tier Finnhub silently drops symbols outside its coverage.
          // Fall through to Yahoo so the user still gets something.
          const fallback = await getYahooEarnings(ticker);
          allEvents.push(...fallback);
        } else {
          allEvents.push(...events);
        }
      } catch (e) {
        lastProviderErrors.push({ provider: 'finnhub', ticker, message: `earnings: ${(e as Error).message}` });
        const fallback = await getYahooEarnings(ticker);
        allEvents.push(...fallback);
      }
    }
  } else {
    // No Finnhub key — everything routes through Yahoo.
    for (const ticker of usTickers) {
      const yh = await getYahooEarnings(ticker);
      allEvents.push(...yh);
    }
  }

  // International: always Yahoo (Finnhub free-tier doesn't cover them).
  for (const ticker of intlTickers) {
    const yh = await getYahooEarnings(ticker);
    allEvents.push(...yh);
  }

  // Sort ascending by date so "next event" is first.
  allEvents.sort((a, b) => a.date.localeCompare(b.date));
  await writeCache(cacheKey, allEvents, EARNINGS_TTL_MS);
  return allEvents;
}

// ── /stock/earnings (historical actuals + estimates, ~4 quarters back) ──
//
// v1.2 Fundamental signal — surprise history needs >=2 quarters of past
// actuals vs estimates. /calendar/earnings only returns the -7d/+60d
// window so it's insufficient. /stock/earnings carries the last few
// quarters with `actual`, `estimate`, `surprise`, `surprisePercent`.
// Cached 24h (will rise to weekly under the three-tier pass).

interface FinnhubEarningsSurprise {
  symbol: string;
  period: string;     // YYYY-MM-DD (quarter end)
  actual?: number;
  estimate?: number;
  surprise?: number;
  surprisePercent?: number;
  quarter?: number;
  year?: number;
}

// v1.2 — Fundamental tier. Earnings actuals only land once per quarter so
// a weekly TTL is comfortably fresh.
const EARNINGS_HIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getEarningsHistory(ticker: string): Promise<EarningsEvent[]> {
  const key = `earnings_hist_${ticker.toUpperCase()}`;
  const cached = await readCacheWithTTL<EarningsEvent[]>(key, EARNINGS_HIST_TTL_MS);
  if (cached) return cached;
  // v1.2 follow-up — BUG-8. International tickers fall through to Yahoo's
  // earningsHistory module (Finnhub free tier is US-only). Previously this
  // returned [], permanently disabling the earningsSurprise signal for
  // non-US holdings.
  if (isInternationalTicker(ticker)) return getYahooEarningsHistory(ticker);
  const apiKey = await getApiKey('finnhub');
  if (!apiKey) return getYahooEarningsHistory(ticker);
  const gate = shouldFetch('finnhub-earnings-hist', 'finnhub', { force: false, maxPerMinute: 60, subKey: ticker });
  if (!gate.allow) return getYahooEarningsHistory(ticker);
  try {
    recordCall('finnhub-earnings-hist', 'finnhub', ticker);
    const data = await finnhubGet<FinnhubEarningsSurprise[]>(
      '/stock/earnings',
      { symbol: ticker.toUpperCase() },
      apiKey,
      { timeout: 10000 },
    );
    const arr = Array.isArray(data) ? data : [];
    // Newest-first; cap at 8 quarters so the cache row stays small.
    arr.sort((a, b) => b.period.localeCompare(a.period));
    const mapped: EarningsEvent[] = arr.slice(0, 8).map((e) => ({
      symbol: e.symbol,
      date: e.period,
      epsActual: e.actual,
      epsEstimate: e.estimate,
      quarter: e.quarter,
      year: e.year,
    }));
    // BUG-8 — same fall-through-on-empty as getRecommendations. Free-tier
    // Finnhub silently drops coverage for many symbols; rather than emit a
    // permanent "earnings unavailable" we let Yahoo try.
    if (mapped.length === 0) return getYahooEarningsHistory(ticker);
    await writeCache(key, mapped, EARNINGS_HIST_TTL_MS);
    return mapped;
  } catch (e) {
    lastProviderErrors.push({ provider: 'finnhub', ticker, message: `earnings hist: ${(e as Error).message}` });
    return getYahooEarningsHistory(ticker);
  }
}

// ── /stock/dividend ──────────────────────────────────────────────────────

const DIV_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface FinnhubDividend {
  symbol: string;
  date: string;
  amount: number;
  currency: string;
  payDate?: string;
  recordDate?: string;
}

export async function getDividends(ticker: string): Promise<DividendEvent[]> {
  const key = `div_${ticker.toUpperCase()}`;
  const cached = await readCacheWithTTL<DividendEvent[]>(key, DIV_TTL_MS);
  if (cached) return cached;
  // International or no-key: Yahoo provides a yield + ex-div approximation
  // (single trailing-annual synthetic event + future ex-div marker). Less
  // granular than Finnhub's per-payment list but enough for DividendTracker
  // which only needs trailing-12m and next ex-div.
  if (isInternationalTicker(ticker)) return getYahooDividendApproximation({ ticker });
  const apiKey = await getApiKey('finnhub');
  if (!apiKey) return getYahooDividendApproximation({ ticker });
  const gate = shouldFetch('finnhub-div', 'finnhub', { force: false, maxPerMinute: 60, subKey: ticker });
  if (!gate.allow) return getYahooDividendApproximation({ ticker });
  // 1 year backwards (enough to project annual income from trailing 12 months)
  // + 6 months forward (catches upcoming ex-div dates).
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const to = new Date();
  to.setMonth(to.getMonth() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  try {
    recordCall('finnhub-div', 'finnhub', ticker);
    // v1.2.1 — finnhubGet for native CapacitorHttp routing.
    const data = await finnhubGet<FinnhubDividend[]>(
      '/stock/dividend',
      {
        symbol: ticker.toUpperCase(),
        from: fmt(from),
        to: fmt(to),
      },
      apiKey,
      { timeout: 10000 },
    );
    const arr = Array.isArray(data) ? data : [];
    const events: DividendEvent[] = arr.map((d) => ({
      symbol: d.symbol,
      date: d.date,
      amount: d.amount,
      currency: d.currency || 'USD',
      payDate: d.payDate,
      recordDate: d.recordDate,
    }));
    events.sort((a, b) => a.date.localeCompare(b.date));
    if (events.length === 0) {
      // Empty list from Finnhub free for some symbols — try Yahoo's
      // approximation instead of telling the user "no dividends" for an
      // SCHD-style ETF that obviously pays.
      return getYahooDividendApproximation({ ticker });
    }
    await writeCache(key, events, DIV_TTL_MS);
    return events;
  } catch (e) {
    lastProviderErrors.push({ provider: 'finnhub', ticker, message: `div: ${(e as Error).message}` });
    return getYahooDividendApproximation({ ticker });
  }
}

export async function getDividendsAll(tickers: string[]): Promise<Map<string, DividendEvent[]>> {
  const out = new Map<string, DividendEvent[]>();
  // Sequential not parallel — each call costs against the 60/min budget and
  // we'd rather degrade gracefully than burst-saturate it for a 10-holding
  // refresh that also did quotes + metric + news.
  for (const t of tickers) {
    const list = await getDividends(t);
    if (list.length) out.set(t.toUpperCase(), list);
  }
  return out;
}
