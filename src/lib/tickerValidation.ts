// v1.2.1 — security hardening (audit finding M).
//
// Ticker / CoinGecko-id entry-point allowlist. Every Yahoo / Finnhub /
// CoinGecko URL we build interpolates a user-typed identifier as a path
// segment. URL construction already runs the value through
// `encodeURIComponent(ticker)` at every call site, which converts `/`, `?`,
// `&`, and `..` into safe percent-escapes — so straight path-traversal
// is structurally impossible.
//
// The v1.2.1 audit (scope item M) requires defense-in-depth at the *entry
// point* so we never store or sync a payload that looks like an attack.
// The allowlist is the smallest character set that covers every real
// instrument shape we support:
//
//   - US stocks/ETFs           AAPL, SPY, BRK.B
//   - International exchanges  CNDX.L, NDAFIH.HE, SAN.MC, 7203.T
//   - Indices                  ^GSPC, ^IXIC, ^FTSE
//   - FX                       EURUSD=X
//   - Futures / forwards       ES=F, GC=F
//   - Crypto / CoinGecko ids   bitcoin, ethereum, usd-coin, 1inch,
//                              shiba-inu, bitcoin-cash
//
// Upper bound 20 chars — the longest legitimate identifier we've seen is
// ~12 (CoinGecko's `wrapped-bitcoin-cash`). 20 leaves comfortable room
// without being a footgun.
//
// Case folded via /i so the crypto (lowercase) path through
// `ticker.trim().toLowerCase()` continues to validate identically.

const TICKER_RE = /^[A-Z0-9.^:=-]{1,20}$/i;

export interface TickerValidationResult {
  ok: boolean;
  /** Trimmed value (caller decides case-folding). Empty string when input was empty. */
  normalised: string;
  /** User-facing error message; empty when ok=true. */
  error: string;
}

/**
 * Validate a user-typed ticker / CoinGecko id against the v1.2.1 allowlist.
 *
 * Trims whitespace before checking — leading/trailing whitespace is a
 * keyboard artifact, not an attack. Does NOT case-fold; callers normalise
 * to upper (stocks/ETFs) or lower (crypto) after validation. Pass the
 * trimmed value back through the regex with the /i flag intact.
 */
export function validateTicker(raw: string): TickerValidationResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, normalised: '', error: 'Ticker is required.' };
  }
  if (trimmed.length > 20) {
    return {
      ok: false,
      normalised: trimmed,
      error: 'Ticker is too long (max 20 chars).',
    };
  }
  if (!TICKER_RE.test(trimmed)) {
    return {
      ok: false,
      normalised: trimmed,
      error: 'Ticker can only contain letters, digits, and . ^ : = -',
    };
  }
  return { ok: true, normalised: trimmed, error: '' };
}
