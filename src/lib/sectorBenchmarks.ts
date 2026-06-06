// ─── Sector benchmark lookups (P/E, P/S, debt/equity)  ────────────────────
//
// Static reference values used by the Fundamental signal engine to compare
// a holding's ratios against its sector. Numbers are intentionally rounded
// medians — they're a sanity reference for the score, not a precise
// peer-percentile rank. The Fundamental tab surfaces "score" not "rank",
// and lo-fi peer averages match the lo-fi-by-design ethos of the
// composite engine.
//
// Sources: anchored to long-run S&P-500 sector medians from public
// datasets (Damodaran NYU, FactSet press releases). Refresh occasionally
// as needed — these aren't volatile across years for "the average".
//
// Keyed on Finnhub's `finnhubIndustry` string from `/stock/profile2`. We
// don't have a richer sector taxonomy; if `finnhubIndustry` is missing or
// doesn't match a key, we fall through to `default` and the comparison
// signals report `available: false`.

export interface SectorBench {
  /** Median trailing P/E for the sector. */
  pe: number;
  /** Median P/S for the sector. */
  ps: number;
  /** Median debt/equity (decimal — 0.5 = 50%). */
  de: number;
}

// "default" is a generic large-cap blend used when we have a metric but
// no matching sector. Less informative than a true sector match but better
// than silently dropping the signal.
const DEFAULT_BENCH: SectorBench = { pe: 22, ps: 2.4, de: 1.0 };

const TABLE: Record<string, SectorBench> = {
  // Tech / software / semis — higher multiples, lower leverage.
  Technology:         { pe: 28, ps: 5.0, de: 0.6 },
  Semiconductors:     { pe: 26, ps: 6.5, de: 0.5 },

  // Communication / media.
  'Communication Services':         { pe: 20, ps: 2.8, de: 0.8 },
  Telecommunication:                { pe: 18, ps: 1.6, de: 1.4 },
  Media:                            { pe: 22, ps: 2.5, de: 1.0 },

  // Consumer.
  'Consumer Discretionary':         { pe: 24, ps: 1.5, de: 1.0 },
  Retail:                           { pe: 22, ps: 1.2, de: 1.2 },
  'Consumer Staples':               { pe: 22, ps: 1.5, de: 1.0 },

  // Financials.
  Banking:                          { pe: 12, ps: 2.4, de: 0.9 },
  'Financial Services':             { pe: 14, ps: 2.6, de: 1.0 },
  Insurance:                        { pe: 14, ps: 1.3, de: 0.7 },

  // Health / pharma.
  Health:                           { pe: 22, ps: 2.5, de: 0.7 },
  Pharmaceutical:                   { pe: 18, ps: 4.0, de: 0.9 },
  Biotechnology:                    { pe: 30, ps: 7.0, de: 0.5 },

  // Industrials / energy / materials.
  Industrials:                      { pe: 20, ps: 1.6, de: 1.0 },
  'Energy':                         { pe: 14, ps: 1.2, de: 0.7 },
  'Oil & gas':                      { pe: 12, ps: 1.0, de: 0.7 },
  Materials:                        { pe: 18, ps: 1.7, de: 0.9 },
  Utilities:                        { pe: 18, ps: 2.0, de: 1.4 },

  // Real estate.
  'Real Estate':                    { pe: 26, ps: 6.0, de: 1.6 },
};

/** Look up a sector benchmark. Pass the `finnhubIndustry` value from the
 *  profile cache. Returns DEFAULT_BENCH when no match — caller can detect
 *  the fallback via `matched: false`. */
export function lookupSectorBench(industry?: string): {
  bench: SectorBench;
  matched: boolean;
  industry: string;
} {
  if (!industry) return { bench: DEFAULT_BENCH, matched: false, industry: 'default' };
  const direct = TABLE[industry];
  if (direct) return { bench: direct, matched: true, industry };
  // Case-insensitive contains-match for the cases where Finnhub uses a
  // slightly different label shape ("Information Technology" vs "Technology").
  const lc = industry.toLowerCase();
  for (const [key, bench] of Object.entries(TABLE)) {
    if (lc.includes(key.toLowerCase()) || key.toLowerCase().includes(lc)) {
      return { bench, matched: true, industry: key };
    }
  }
  return { bench: DEFAULT_BENCH, matched: false, industry: 'default' };
}
