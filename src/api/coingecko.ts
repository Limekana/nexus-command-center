import axios from 'axios';
import { readCache, writeCache, shouldFetch, recordCall } from './cache';
import { lastProviderErrors } from './yahoo';

const BASE_URL = 'https://api.coingecko.com/api/v3';

export interface CryptoPrice {
  id: string;
  priceUsd: number;
  priceEur: number;
  change24h: number;
  // 7-day hourly close series. Populated by getCryptoMarkets; empty for the
  // legacy /simple/price path (no longer used by the store, kept for safety).
  spark7d?: number[];
  marketCapEur?: number;
}

export interface CryptoResult {
  prices: CryptoPrice[];
  ageMinutes: number;
  cached: boolean;
  stale: boolean;
}

// /coins/markets returns ~168 hourly close prices for a 7d sparkline plus
// market cap, all in one call. We use EUR as the vs_currency since that's
// our anchor for crypto pricing; baseCurrency conversion happens at render
// time via fxRates. USD price isn't displayed anywhere; we compute it from
// the EUR rate only as a back-compat shim for cached entries.
interface CoinMarketRow {
  id: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  sparkline_in_7d?: { price: number[] };
}

export async function getCryptoPrices(
  ids: string[],
  opts: { force?: boolean } = {},
): Promise<CryptoResult | null> {
  if (!ids.length) return { prices: [], ageMinutes: 0, cached: false, stale: false };
  // Cache key bumped (v2) so legacy /simple/price entries don't shadow the
  // new richer payload.
  const key = `coingecko_v2_${ids.sort().join(',')}`;
  const cached = await readCache<CryptoPrice[]>(key);
  if (cached?.fresh && !opts.force) {
    return { prices: cached.data, ageMinutes: cached.ageMinutes, cached: true, stale: false };
  }
  const gate = shouldFetch('coingecko', 'coingecko', { force: opts.force, maxPerMinute: 30 });
  if (!gate.allow) {
    lastProviderErrors.push({ provider: 'coingecko', message: gate.reason ?? 'rate-limited' });
    if (cached) return { prices: cached.data, ageMinutes: cached.ageMinutes, cached: true, stale: true };
    return null;
  }
  try {
    recordCall('coingecko', 'coingecko');
    const { data } = await axios.get<CoinMarketRow[]>(`${BASE_URL}/coins/markets`, {
      params: {
        vs_currency: 'eur',
        ids: ids.join(','),
        sparkline: 'true',
        price_change_percentage: '24h',
        per_page: ids.length,
        page: 1,
      },
      timeout: 10000,
    });
    const byId = new Map(data.map((r) => [r.id, r]));
    const prices: CryptoPrice[] = ids
      .filter((id) => byId.has(id))
      .map((id) => {
        const r = byId.get(id)!;
        return {
          id,
          priceEur: r.current_price,
          // USD isn't displayed; left at 0 — Portfolio converts EUR → base via fxRates.
          priceUsd: 0,
          change24h: r.price_change_percentage_24h ?? 0,
          spark7d: r.sparkline_in_7d?.price ?? [],
          marketCapEur: r.market_cap ?? undefined,
        };
      });
    await writeCache(key, prices);
    return { prices, ageMinutes: 0, cached: false, stale: false };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    lastProviderErrors.push({ provider: 'coingecko', message: msg });
    console.warn('[coingecko]', msg);
    if (cached) return { prices: cached.data, ageMinutes: cached.ageMinutes, cached: true, stale: true };
    return null;
  }
}
