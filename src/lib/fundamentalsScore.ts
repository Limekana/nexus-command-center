// ─── NCC v1.2 Fundamentals composite scoring ──────────────────────────────
//
// Mirror of insightsScore.ts but for the Fundamental tab. Shares the same
// 5-tier ladder (Strong Buy → Strong Sell), same auto-renormalization on
// missing signals, same composite output shape so the UI doesn't fork.
//
// Weights total 1.0. Calibration:
//   - Analyst consensus 20%  : real institutional signal — top weight
//   - Earnings surprise 15%  : execution track record matters
//   - Valuation triplet 30% combined (P/E 10 / P/B 10 / P/S 10): well-
//     reasoned valuation matters, but no single multiple is decisive
//   - PEG               10%  : growth-adjusted multiple — useful but noisy
//   - Debt/Equity       10%  : structural risk gauge
//   - Revenue growth YoY 15% : fundamental driver of long-term returns
//
// The Technical engine's calibration favors trend; this one favors quality
// + analyst alignment. Together they let a user see both lenses on a name.

import type { SignalResult } from './insightSignals';
import type { Recommendation, EarningsEvent } from '../api/stockDetail';
import { getStockMetric, getRecommendations, getEarningsHistory } from '../api/stockDetail';
import { getCompanyProfile } from '../api/companyProfile';
import {
  peVsSectorSignal,
  pbRatioSignal,
  psVsSectorSignal,
  pegRatioSignal,
  debtToEquitySignal,
  revenueGrowthSignal,
  earningsSurpriseSignal,
  analystConsensusSignal,
} from './fundamentalSignals';
import {
  scoreToTier,
  TIER_LABEL,
  TIER_STEP,
  type InsightTier,
} from './insightsScore';

// Re-export so callers can stay tier-agnostic between the two engines.
export { scoreToTier, TIER_LABEL, TIER_STEP };
export type { InsightTier };

export interface FundamentalBreakdown {
  peVsSector: SignalResult;
  pbRatio: SignalResult;
  psVsSector: SignalResult;
  pegRatio: SignalResult;
  debtToEquity: SignalResult;
  revenueGrowth: SignalResult;
  earningsSurprise: SignalResult;
  analystConsensus: SignalResult;
}

export interface FundamentalRating {
  ticker: string;
  score: number;
  tier: InsightTier;
  breakdown: FundamentalBreakdown;
  computedAt: string;
  partial: boolean;
}

const WEIGHTS: Record<keyof FundamentalBreakdown, number> = {
  peVsSector:       0.10,
  pbRatio:          0.10,
  psVsSector:       0.10,
  pegRatio:         0.10,
  debtToEquity:     0.10,
  revenueGrowth:    0.15,
  earningsSurprise: 0.15,
  analystConsensus: 0.20,
};

/** Compose a fundamental rating from an explicit breakdown. Pure — no
 *  fetches. Reusable from the orchestrator and from tests. */
export function composeFundamentalRating(
  ticker: string,
  breakdown: FundamentalBreakdown,
): FundamentalRating {
  let weightedSum = 0;
  let availableWeight = 0;
  let partial = false;
  const entries = Object.entries(breakdown) as [keyof FundamentalBreakdown, SignalResult][];
  for (const [key, result] of entries) {
    if (result.available) {
      weightedSum += result.score * WEIGHTS[key];
      availableWeight += WEIGHTS[key];
    } else {
      partial = true;
    }
  }
  const score = availableWeight > 0 ? weightedSum / availableWeight : 0;
  return {
    ticker,
    score,
    tier: scoreToTier(score),
    breakdown,
    computedAt: new Date().toISOString(),
    partial,
  };
}

/**
 * Fetch fundamentals for a ticker and compute the composite. All input
 * fetches are cache-first (24h in v1.2.1, will become weekly under the
 * three-tier architecture pass). Returns null only when even the metric
 * fetch failed AND we have no analyst recs to fall back on.
 *
 * Caller in the orchestrator typically batches multiple tickers; each call
 * here is independent so a Promise.all is safe.
 */
export async function computeFundamentalForTicker(
  ticker: string,
): Promise<FundamentalRating | null> {
  // v1.2 code-review finding #1 — serialize the four Finnhub fetches.
  //
  // Previous version used Promise.all which, paired with the outer
  // sequential per-ticker loop in `recomputeFundamentalsAll`, produces a
  // sustained burst of 4 calls per ticker. On a cold-cache first sweep of
  // a 15-ticker portfolio that's ~240 requests/minute — well above the
  // Finnhub free-tier 60/min cap. Cache hits (7d TTL) cost nothing, so
  // serializing only matters on the first sweep; the user-visible
  // walltime cost there is ~3-4× a single call per ticker, dwarfed by
  // the Yahoo history call the technical sweep is doing in parallel.
  //
  // Each fetch is wrapped in catch so a single network blip doesn't
  // collapse the rest of the breakdown.
  const metric = await getStockMetric(ticker).catch(() => null);
  const recs = await getRecommendations(ticker).catch(() => [] as Recommendation[]);
  const earnings = await getEarningsHistory(ticker).catch(() => [] as EarningsEvent[]);
  const profile = await getCompanyProfile(ticker).catch(() => null);

  const industry = profile?.finnhubIndustry;

  const breakdown: FundamentalBreakdown = {
    peVsSector:       peVsSectorSignal(metric, industry),
    pbRatio:          pbRatioSignal(metric),
    psVsSector:       psVsSectorSignal(metric, industry),
    pegRatio:         pegRatioSignal(metric),
    debtToEquity:     debtToEquitySignal(metric, industry),
    revenueGrowth:    revenueGrowthSignal(metric),
    earningsSurprise: earningsSurpriseSignal(earnings),
    analystConsensus: analystConsensusSignal(recs),
  };

  // If literally every signal is unavailable, treat as null so the UI shows
  // "data unavailable" instead of a misleading hold-zero score.
  const anyAvailable = Object.values(breakdown).some((s) => s.available);
  if (!anyAvailable) return null;

  return composeFundamentalRating(ticker, breakdown);
}
