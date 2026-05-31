// Per-holding news relevance filter (BUG-3 fix).
//
// PROBLEM: Both Yahoo's `/v1/finance/search?q=TICKER` and (rarely) Finnhub's
// `/company-news?symbol=TICKER` can return stories that aren't actually about
// the requested company. Yahoo's search is keyword-driven — when a symbol
// isn't well-recognized (international tickers like `NDAFIH.HE`, niche ETFs,
// low-coverage names), it degrades to broad keyword matching and returns
// stories about Trump, the World Cup, sanctuary cities, etc. The portfolio
// pipeline then stamps those with the holding's ticker and renders them as
// "Nordea news" — completely false attribution.
//
// FIX: a strict client-side allowlist. A story is only attributed to a holding
// if the ticker (with or without exchange suffix), or the company's display
// name, or its first significant word, appears in the headline or summary.
// Anything else is dropped — better an empty per-holding section than a
// wall of misattributed stories.
//
// We deliberately don't try to "rescue" rejected stories into the Market
// bucket — the Market section is populated by its own `getMarketNews` pipeline
// (Finnhub /news or Yahoo "stock market" search). The rejects from a
// ticker-search are usually already in there (or near-duplicates of it), so
// rerouting would just duplicate content.

// English-language generic suffixes / prefixes that appear in `longName`
// fields but are too common to use as match keys on their own. If the first
// word of `longName` is one of these, we walk forward to find a real name
// token instead. Includes both common English ("Inc", "Group") and the
// international corporate suffixes Yahoo returns in its `longName` field
// for global exchanges (Oyj for Finnish, AG for German, etc.).
const GENERIC_NAME_TOKENS = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'plc', 'sa', 'ag', 'nv', 'bv', 'oyj', 'abp', 'asa',
  'spa', 'gmbh', 'kgaa', 'group', 'holdings', 'holding', 'trust', 'fund',
  'etf', 'the', 'a', 'an', 'class', 'common', 'stock', 'shares',
]);

export interface RelevanceCheck {
  /** Ticker as the user types it, e.g. `NDAFIH.HE` or `AAPL`. */
  ticker: string;
  /** Ticker base (exchange suffix stripped), e.g. `NDAFIH` or `AAPL`. */
  tickerBase: string;
  /** Full company display name if available (e.g. `Nordea Bank Abp`). */
  companyName?: string;
  /** First non-generic word of `companyName` — the looser match key (e.g. `Nordea`). */
  companyKey?: string;
}

/** Build a RelevanceCheck for one ticker. `companyName` should come from
 *  the Yahoo chart-meta cache (`readChartMeta(ticker).longName`) when
 *  available; pass `undefined` if not. */
export function buildRelevanceCheck(
  ticker: string,
  companyName?: string,
): RelevanceCheck {
  const upper = ticker.toUpperCase();
  // Strip exchange suffix on the rightmost dot. We don't split on every dot
  // because some tickers contain a single internal dot already (rare, but
  // BRK.B / BRK-B variations exist on different feeds).
  const lastDot = upper.lastIndexOf('.');
  const tickerBase = lastDot > 0 && upper.length - lastDot <= 4
    ? upper.slice(0, lastDot)
    : upper;

  let companyKey: string | undefined;
  if (companyName) {
    const words = companyName.trim().split(/\s+/);
    for (const w of words) {
      const norm = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      // Skip short tokens (1-2 chars), pure numbers, and generic corporate
      // suffixes — none of these are useful as standalone match keys.
      if (norm.length < 3 || /^\d+$/.test(norm) || GENERIC_NAME_TOKENS.has(norm)) {
        continue;
      }
      companyKey = w;
      break;
    }
  }

  return { ticker: upper, tickerBase, companyName, companyKey };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns true iff the news item is plausibly about the company described
 *  by the check. Match rules (any one is sufficient):
 *  1. Ticker base appears as a whole token in headline or summary
 *     (word-boundary anchored to avoid `AA` matching `AAUGHT`).
 *  2. Full ticker (including exchange suffix) appears verbatim. Rare.
 *  3. Company `longName` appears as a substring (must be ≥4 chars to avoid
 *     false positives on common short company names).
 *  4. `companyKey` (first significant word of longName) appears as a whole
 *     token. This is the looser, most-permissive match — catches the common
 *     case where a headline says "Nordea announces..." but never quotes the
 *     full "Nordea Bank Abp" official name.
 *
 *  Everything else is rejected. */
export function isNewsRelevant(
  item: { headline: string; summary?: string },
  check: RelevanceCheck,
): boolean {
  const haystack = `${item.headline}\n${item.summary ?? ''}`.toLowerCase();

  // 1. Ticker base — word-boundary anchored.
  const baseLower = check.tickerBase.toLowerCase();
  if (baseLower.length >= 2) {
    const baseRe = new RegExp(`\\b${escapeRegex(baseLower)}\\b`);
    if (baseRe.test(haystack)) return true;
  }

  // 2. Full ticker if different from base (e.g. `NDAFIH.HE`). The dot makes
  // a verbatim substring search safer than a regex with `\b`.
  if (check.ticker !== check.tickerBase) {
    if (haystack.includes(check.ticker.toLowerCase())) return true;
  }

  // 3. Full company name substring.
  if (check.companyName) {
    const cn = check.companyName.toLowerCase();
    if (cn.length >= 4 && haystack.includes(cn)) return true;
  }

  // 4. Company key — first significant word. Word-boundary anchored.
  if (check.companyKey) {
    const ckLower = check.companyKey.toLowerCase();
    if (ckLower.length >= 3) {
      const ckRe = new RegExp(`\\b${escapeRegex(ckLower)}\\b`);
      if (ckRe.test(haystack)) return true;
    }
  }

  return false;
}
