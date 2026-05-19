// API limits and TTLs. Finnhub uses a strict per-key BYO-key model — there is
// NO shipped default key, and the previous default constant was removed for
// security reasons (a hardcoded default in a client SPA is effectively public).
// Users configure their Finnhub key in Settings → API Keys; the app falls back
// to Yahoo when no key is set.

export const API_RATE_LIMITS = {
  finnhub: 60,       // calls per minute (free tier)
  coingecko: 30,     // calls per minute (no key)
  cacheTtlMinutes: 60,
} as const;
