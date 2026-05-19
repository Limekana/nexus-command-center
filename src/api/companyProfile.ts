// Finnhub /stock/profile2 — company metadata (logo, sector, country, market cap).
// We cache aggressively (sector ≈ stable for years; even market cap is fine
// at week-old precision for an allocation donut). The cache module's default
// TTL is 60 minutes; here we use a parallel longer-lived in-memory + Dexie
// strategy so the next refresh doesn't slam Finnhub for data we already have.
//
// Free tier limit: 60 calls/min, shared with /quote. Profile fetches happen
// only for new tickers on first refresh; afterwards we read from cache.
//
// International tickers (.HE, .L, etc.) return empty from free Finnhub.
// We don't try Yahoo's equivalent (profile/summaryProfile) here — sector
// data via Yahoo is enough work that we'd punt to a v3 pass. Holdings
// without a profile fall into an "Other" bucket on the allocation donut.

import axios from 'axios';
import { db } from '../db/database';
import { getApiKey } from './keys';
import { shouldFetch, recordCall } from './cache';
import { lastProviderErrors, isInternationalTicker } from './yahoo';

const BASE_URL = 'https://finnhub.io/api/v1';
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CompanyProfile {
  ticker: string;
  name?: string;
  logo?: string;
  finnhubIndustry?: string; // e.g. "Technology", "Financial Services"
  country?: string;
  marketCapitalization?: number; // millions of USD
  currency?: string;
  exchange?: string;
}

// In-memory hit cache for the current session. Avoids round-tripping Dexie
// on every render of the Portfolio screen.
const memCache = new Map<string, CompanyProfile>();

interface RawProfile {
  name?: string;
  logo?: string;
  finnhubIndustry?: string;
  country?: string;
  marketCapitalization?: number;
  currency?: string;
  exchange?: string;
  ticker?: string;
}

export async function getCompanyProfile(
  ticker: string,
  opts: { force?: boolean } = {},
): Promise<CompanyProfile | null> {
  const key = ticker.toUpperCase();
  if (!opts.force && memCache.has(key)) return memCache.get(key)!;

  // Dexie cache — apiCache table is keyed on cacheKey. We reuse it but with
  // our own 7-day TTL check (the readCache helper uses 60min and we want longer).
  const cacheKey = `profile_${key}`;
  const entry = await db.apiCache.get(cacheKey);
  if (entry && !opts.force) {
    const fetchedAt = new Date(entry.fetchedAt).getTime();
    if (Date.now() - fetchedAt < PROFILE_TTL_MS) {
      const data = JSON.parse(entry.data) as CompanyProfile;
      memCache.set(key, data);
      return data;
    }
  }

  // International tickers: Finnhub free returns nothing useful. Skip the
  // network call entirely.
  if (isInternationalTicker(ticker)) return null;

  const apiKey = await getApiKey('finnhub');
  if (!apiKey) return null;
  const gate = shouldFetch('finnhub-profile', 'finnhub', { force: false, maxPerMinute: 60, subKey: ticker });
  if (!gate.allow) return null;

  try {
    recordCall('finnhub-profile', 'finnhub', ticker);
    const { data } = await axios.get<RawProfile>(`${BASE_URL}/stock/profile2`, {
      params: { symbol: key },
      headers: { 'X-Finnhub-Token': apiKey },
      timeout: 8000,
    });
    if (!data || !data.name) {
      // Free tier returns an empty object {} for unsupported tickers — no
      // error worth surfacing, just nothing to render.
      return null;
    }
    const profile: CompanyProfile = {
      ticker: key,
      name: data.name,
      logo: data.logo,
      finnhubIndustry: data.finnhubIndustry,
      country: data.country,
      marketCapitalization: data.marketCapitalization,
      currency: data.currency,
      exchange: data.exchange,
    };
    const now = new Date();
    await db.apiCache.put({
      cacheKey,
      data: JSON.stringify(profile),
      fetchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PROFILE_TTL_MS).toISOString(),
    });
    memCache.set(key, profile);
    return profile;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    lastProviderErrors.push({ provider: 'finnhub', ticker: key, message: `profile: ${msg}` });
    return null;
  }
}

export async function getCompanyProfiles(tickers: string[]): Promise<Map<string, CompanyProfile>> {
  const out = new Map<string, CompanyProfile>();
  const results = await Promise.all(tickers.map((t) => getCompanyProfile(t)));
  results.forEach((r, i) => {
    if (r) out.set(tickers[i].toUpperCase(), r);
  });
  return out;
}
