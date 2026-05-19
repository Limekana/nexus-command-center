// FX rates via open.er-api.com — free, no key, daily rates, generous limits.
// We cache a single "rates anchored to USD" snapshot for 12 hours and derive
// any from→to conversion from it.

import axios from 'axios';
import { readCache, writeCache } from './cache';

const URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'fx_usd_anchor';

interface RatesPayload {
  base: 'USD';
  rates: Record<string, number>; // currency code → units of currency per 1 USD
  ts: number; // ms
}

let memoryCache: RatesPayload | null = null;

async function loadFromCache(): Promise<RatesPayload | null> {
  if (memoryCache) return memoryCache;
  const c = await readCache<RatesPayload>(CACHE_KEY);
  if (c) {
    memoryCache = c.data;
    return memoryCache;
  }
  return null;
}

async function fetchFresh(): Promise<RatesPayload | null> {
  try {
    const { data } = await axios.get<{ result: string; base_code: string; rates: Record<string, number> }>(URL, { timeout: 8000 });
    if (data?.result !== 'success' || !data.rates) return null;
    const payload: RatesPayload = { base: 'USD', rates: data.rates, ts: Date.now() };
    await writeCache(CACHE_KEY, payload);
    memoryCache = payload;
    return payload;
  } catch {
    return null;
  }
}

export async function ensureFxRates(): Promise<RatesPayload | null> {
  const cached = await loadFromCache();
  // Refresh if older than 12 hours.
  const stale = !cached || Date.now() - cached.ts > 12 * 60 * 60 * 1000;
  if (stale) {
    const fresh = await fetchFresh();
    if (fresh) return fresh;
  }
  return cached;
}

// Normalize quirky Yahoo currency codes. GBp = pence (1/100 of GBP).
// ZAc = South African cents, ILA = Israeli agorot — same idea but rare.
export function normalizeCurrency(amount: number, currency: string): { amount: number; currency: string } {
  const c = currency?.toUpperCase();
  if (currency === 'GBp' || c === 'GBX') return { amount: amount / 100, currency: 'GBP' };
  if (currency === 'ZAc') return { amount: amount / 100, currency: 'ZAR' };
  if (currency === 'ILA') return { amount: amount / 100, currency: 'ILS' };
  return { amount, currency: c || 'USD' };
}

// Convert `amount` from `from` currency into `to` currency using cached rates.
// Returns null if rates aren't loaded or either currency is unknown.
export async function convert(amount: number, from: string, to: string): Promise<number | null> {
  const norm = normalizeCurrency(amount, from);
  const fromCur = norm.currency;
  const value = norm.amount;
  if (fromCur === to) return value;

  const payload = await ensureFxRates();
  if (!payload) return null;
  const rates = payload.rates;
  // USD is the anchor: rates[X] = how many X per 1 USD.
  const usd = fromCur === 'USD' ? value : value / (rates[fromCur] ?? NaN);
  if (!isFinite(usd)) return null;
  if (to === 'USD') return usd;
  const result = usd * (rates[to] ?? NaN);
  return isFinite(result) ? result : null;
}

// Synchronous variant for use inside selectors when rates are already loaded.
export function convertSync(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number> | null
): number | null {
  const norm = normalizeCurrency(amount, from);
  const fromCur = norm.currency;
  const value = norm.amount;
  if (fromCur === to) return value;
  if (!rates) return null;
  const usd = fromCur === 'USD' ? value : value / (rates[fromCur] ?? NaN);
  if (!isFinite(usd)) return null;
  if (to === 'USD') return usd;
  const result = usd * (rates[to] ?? NaN);
  return isFinite(result) ? result : null;
}

export async function getCachedRates(): Promise<Record<string, number> | null> {
  const p = await ensureFxRates();
  return p?.rates ?? null;
}
