// Market-wide news feed for the Finance overview. Finnhub /news for general
// market coverage when a key is present; Yahoo Finance "topic news" fallback
// otherwise.
//
// Cache 6h since news is not real-time anyway.

import axios from 'axios';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { db } from '../db/database';
import { getApiKey } from './keys';
import { shouldFetch, recordCall } from './cache';
import { lastProviderErrors } from './yahoo';
import { finnhubGet } from './finnhub';
import type { NewsItem } from './stockDetail';

// Native: direct URLs (CapacitorHttp bypasses CORS). Web dev preview:
// through Vite proxies. See vite.config.ts for proxy definitions.
// v1.2.1 — Finnhub URL constant unused now; finnhubGet owns its own URL.
// Kept for documentary purposes / future Yahoo-only changes.
const YAHOO_TRENDING_URL = Capacitor.isNativePlatform()
  ? 'https://query1.finance.yahoo.com/v1/finance/search'
  : '/yfin/v1/finance/search';
const TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_KEY = 'market_news_general';

const BROWSER_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// Same headers minus User-Agent — browsers refuse to set that header on XHR
// and emit "Refused to set unsafe header" warnings on every call. UA is only
// needed on native CapacitorHttp; the browser supplies its own.
const WEB_HEADERS: Record<string, string> = Object.fromEntries(
  Object.entries(BROWSER_HEADERS).filter(([k]) => k.toLowerCase() !== 'user-agent'),
);

async function readCache(): Promise<NewsItem[] | null> {
  const entry = await db.apiCache.get(CACHE_KEY);
  if (!entry) return null;
  if (Date.now() - new Date(entry.fetchedAt).getTime() > TTL_MS) return null;
  try { return JSON.parse(entry.data) as NewsItem[]; } catch { return null; }
}

async function writeCache(news: NewsItem[]): Promise<void> {
  const now = new Date();
  await db.apiCache.put({
    cacheKey: CACHE_KEY,
    data: JSON.stringify(news),
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
  });
}

async function fetchYahooNews(): Promise<NewsItem[]> {
  // Yahoo's search endpoint returns trending finance news when you query a
  // broad term. Using "stock market" gives mainstream English-language wires.
  const params = '?q=stock%20market&newsCount=10&quotesCount=0';
  const url = YAHOO_TRENDING_URL + params;
  let data: { news?: Array<{ uuid: string; title: string; publisher?: string; link: string; providerPublishTime?: number; thumbnail?: { resolutions?: { url?: string }[] } }> };
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      method: 'GET', url, headers: BROWSER_HEADERS,
      connectTimeout: 10_000, readTimeout: 10_000,
    });
    if (res.status >= 400) throw new Error(`Yahoo news HTTP ${res.status}`);
    data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } else {
    const r = await axios.get(url, { headers: WEB_HEADERS, timeout: 10_000 });
    data = r.data;
  }
  const raw = data?.news ?? [];
  return raw
    .filter((n) => n.title && n.link && n.providerPublishTime)
    .slice(0, 10)
    .map((n, i) => ({
      id: parseInt(n.uuid?.replace(/\D/g, '').slice(0, 9) || `${i}`, 10) || i,
      datetime: n.providerPublishTime!,
      headline: n.title,
      source: n.publisher ?? 'Yahoo',
      url: n.link,
      image: n.thumbnail?.resolutions?.[0]?.url,
    }));
}

export async function getMarketNews(): Promise<NewsItem[]> {
  const cached = await readCache();
  if (cached) return cached;
  const gate = shouldFetch('finnhub-news', 'finnhub', { force: false, maxPerMinute: 60, subKey: '__market__' });
  if (!gate.allow) {
    // Soft-gated; try Yahoo as a courtesy fallback before giving up.
    try {
      const yh = await fetchYahooNews();
      if (yh.length) {
        await writeCache(yh);
        return yh;
      }
    } catch {}
    return [];
  }
  const apiKey = await getApiKey('finnhub');
  if (apiKey) {
    try {
      recordCall('finnhub-news', 'finnhub', '__market__');
      // v1.2.1 — finnhubGet for native CapacitorHttp routing.
      const data = await finnhubGet<NewsItem[]>(
        '/news',
        { category: 'general' },
        apiKey,
        { timeout: 10_000 },
      );
      const arr = Array.isArray(data) ? data : [];
      const news: NewsItem[] = arr
        .sort((a, b) => b.datetime - a.datetime)
        .slice(0, 10);
      if (news.length) {
        await writeCache(news);
        return news;
      }
    } catch (e) {
      lastProviderErrors.push({ provider: 'finnhub', message: `market news: ${(e as Error).message}` });
    }
  }
  // Fallback to Yahoo if Finnhub is empty/unavailable/no key.
  try {
    recordCall('yahoo-summary', 'yahoo', '__market__');
    const yh = await fetchYahooNews();
    if (yh.length) {
      await writeCache(yh);
      return yh;
    }
  } catch (e) {
    lastProviderErrors.push({ provider: 'yahoo', message: `market news: ${(e as Error).message}` });
  }
  return [];
}
