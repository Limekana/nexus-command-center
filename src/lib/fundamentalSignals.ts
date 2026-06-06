// ─── NCC v1.2 Fundamental signal engine ───────────────────────────────────
//
// Eight client-side fundamental signals computed from cached Finnhub
// `/stock/metric`, `/calendar/earnings`, `/stock/recommendation` data + the
// company-profile sector tag. Each returns the same `SignalResult` shape as
// the Technical engine so the UI / composite pipeline doesn't need to
// distinguish — the only differences are which signals are summed.
//
// Signals (score in [-100, +100]):
//   1. peVsSector       — P/E discount / premium vs sector median
//   2. pbRatio          — P/B (lower = cheaper, with a floor below ~1 for
//                          quality concerns)
//   3. psVsSector       — P/S vs sector median
//   4. pegRatio         — PEG (canonical: <1 = undervalued, >2 = expensive)
//   5. debtToEquity     — D/E vs sector median (lower = safer)
//   6. revenueGrowthYoy — TTM-YoY revenue growth
//   7. earningsSurprise — beat ratio over the last N quarters with actuals
//   8. analystConsensus — Finnhub recommendation buy/hold/sell composite
//
// Rationale for the weights (in fundamentalsScore.ts):
//   - Analyst consensus + earnings surprises are the most direct "smart
//     money agrees / management delivers" signals → highest weight.
//   - Valuation triplet (P/E, P/B, P/S vs sector) shares 30% combined.
//   - PEG + D/E + Revenue growth fill the rest, each in single-digit
//     weight territory — they're informative but noisy.
//
// All signals are PURE. No fetches here, no Dexie reads. The orchestrator
// hands in already-cached data.

import type { SignalResult } from './insightSignals';
import type { StockMetric, Recommendation, EarningsEvent } from '../api/stockDetail';
import { lookupSectorBench } from './sectorBenchmarks';

const NA: SignalResult = {
  score: 0,
  label: 'Not available',
  detail: 'Insufficient data',
  available: false,
};

/** Clamp helper. */
function clamp(n: number, lo = -100, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

// ─── 1. P/E vs sector ─────────────────────────────────────────────────────

export function peVsSectorSignal(
  metric: StockMetric | null,
  industry?: string,
): SignalResult {
  if (!metric?.peNormalized || metric.peNormalized <= 0) return NA;
  const { bench, matched, industry: matchedIndustry } = lookupSectorBench(industry);
  // Percent discount (positive = cheaper than sector → bullish).
  const discountPct = ((bench.pe - metric.peNormalized) / bench.pe) * 100;
  // 40% discount or premium maps to ±100. Linear in between.
  const score = clamp((discountPct / 40) * 100);
  const direction = discountPct >= 0 ? 'below' : 'above';
  // v1.2 code-review #3 — fall back to "industry avg" when we don't have a
  // sector match instead of leaking the literal "default" key into the UI.
  const benchLabel = matched ? `${matchedIndustry} median` : 'industry avg';
  return {
    score,
    label: discountPct >= 5 ? 'Cheap vs sector P/E' : discountPct <= -5 ? 'Premium vs sector P/E' : 'In-line with sector P/E',
    detail: `P/E ${metric.peNormalized.toFixed(1)} ${direction} ${benchLabel} ${bench.pe.toFixed(0)}`,
    available: true,
  };
}

// ─── 2. P/B ────────────────────────────────────────────────────────────────
//
// P/B alone (not vs sector — bench varies wildly by industry mix and
// embedded sector benchmark already covers most of the spread via P/S).
// Scoring:
//   <0  : negative book → red flag (bearish capped)
//   0-1 : value territory (+score)
//   1-3 : neutral
//   >3  : expensive (-score)

export function pbRatioSignal(metric: StockMetric | null): SignalResult {
  if (!metric?.pbRatio || !isFinite(metric.pbRatio)) return NA;
  const pb = metric.pbRatio;
  let score: number;
  if (pb < 0) score = -60;
  else if (pb <= 1) score = 60 - pb * 30;     // 1.0 → +30, 0 → +60
  else if (pb <= 3) score = 30 - (pb - 1) * 25; // 1 → +30, 3 → -20
  else if (pb <= 6) score = -20 - (pb - 3) * 15; // 3 → -20, 6 → -65
  else score = -85;
  return {
    score: clamp(score),
    label: pb <= 1 ? 'Below book value' : pb <= 3 ? 'Fair book multiple' : 'Premium book multiple',
    detail: `P/B ${pb.toFixed(2)}`,
    available: true,
  };
}

// ─── 3. P/S vs sector ─────────────────────────────────────────────────────

export function psVsSectorSignal(
  metric: StockMetric | null,
  industry?: string,
): SignalResult {
  if (!metric?.psRatio || metric.psRatio <= 0) return NA;
  const { bench, matched, industry: matchedIndustry } = lookupSectorBench(industry);
  const discountPct = ((bench.ps - metric.psRatio) / bench.ps) * 100;
  const score = clamp((discountPct / 40) * 100);
  const direction = discountPct >= 0 ? 'below' : 'above';
  const benchLabel = matched ? `${matchedIndustry} median` : 'industry avg';
  return {
    score,
    label: discountPct >= 5 ? 'Cheap vs sector P/S' : discountPct <= -5 ? 'Premium vs sector P/S' : 'In-line with sector P/S',
    detail: `P/S ${metric.psRatio.toFixed(2)} ${direction} ${benchLabel} ${bench.ps.toFixed(1)}`,
    available: true,
  };
}

// ─── 4. PEG ────────────────────────────────────────────────────────────────
//
// Canonical PEG bands:
//   <0     : negative growth → red flag
//   0-1    : undervalued relative to growth (+score)
//   1-2    : fairly priced (light score)
//   >2     : expensive vs growth (-score)

export function pegRatioSignal(metric: StockMetric | null): SignalResult {
  if (!metric?.pegRatio || !isFinite(metric.pegRatio)) return NA;
  const peg = metric.pegRatio;
  let score: number;
  if (peg < 0) score = -50;
  else if (peg <= 1) score = 100 - peg * 50;  // 0 → +100, 1 → +50
  else if (peg <= 2) score = 50 - (peg - 1) * 80; // 1 → +50, 2 → -30
  else if (peg <= 4) score = -30 - (peg - 2) * 25; // 2 → -30, 4 → -80
  else score = -90;
  return {
    score: clamp(score),
    label: peg < 1 ? 'PEG indicates value' : peg <= 2 ? 'PEG fairly priced' : 'PEG expensive',
    detail: `PEG ${peg.toFixed(2)}`,
    available: true,
  };
}

// ─── 5. Debt/Equity vs sector ─────────────────────────────────────────────

export function debtToEquitySignal(
  metric: StockMetric | null,
  industry?: string,
): SignalResult {
  if (metric?.debtToEquity == null || !isFinite(metric.debtToEquity)) return NA;
  const { bench, matched, industry: matchedIndustry } = lookupSectorBench(industry);
  const de = metric.debtToEquity;
  // Lower D/E = safer. Score by ratio below/above sector. ±60% leverage
  // delta maps to ±100.
  const deltaPct = ((bench.de - de) / Math.max(bench.de, 0.1)) * 100;
  const score = clamp((deltaPct / 60) * 100);
  const benchLabel = matched ? `${matchedIndustry} median` : 'industry avg';
  return {
    score,
    label: deltaPct >= 10 ? 'Lower leverage than sector' : deltaPct <= -10 ? 'Higher leverage than sector' : 'Sector-typical leverage',
    detail: `D/E ${de.toFixed(2)} vs ${benchLabel} ${bench.de.toFixed(2)}`,
    available: true,
  };
}

// ─── 6. YoY revenue growth ────────────────────────────────────────────────

export function revenueGrowthSignal(metric: StockMetric | null): SignalResult {
  if (metric?.revenueGrowthYoy == null || !isFinite(metric.revenueGrowthYoy)) return NA;
  const g = metric.revenueGrowthYoy;
  // ±30% growth maps to ±100, linear.
  const score = clamp((g / 30) * 100);
  return {
    score,
    label: g >= 5 ? 'Growing revenue' : g <= -5 ? 'Shrinking revenue' : 'Flat revenue',
    detail: `Revenue ${g > 0 ? '+' : ''}${g.toFixed(1)}% YoY (TTM)`,
    available: true,
  };
}

// ─── 7. Earnings surprise history ─────────────────────────────────────────
//
// Compare epsActual vs epsEstimate over the most recent N quarters that
// have actuals. Score = (avg beat ratio − 1) × 200, clamped — so a 10%
// average beat lands at +20; a 5% average miss lands at -10.
//
// Need at least 2 quarters with both estimate + actual to score.

export function earningsSurpriseSignal(events: EarningsEvent[]): SignalResult {
  const usable = events.filter(
    (e) => e.epsActual != null && e.epsEstimate != null && e.epsEstimate !== 0,
  );
  if (usable.length < 2) return NA;
  const recent = usable.slice(0, 6);
  let beats = 0;
  let totalRel = 0;
  for (const e of recent) {
    const rel = (e.epsActual! - e.epsEstimate!) / Math.abs(e.epsEstimate!);
    totalRel += rel;
    if (rel > 0) beats += 1;
  }
  const avgRel = totalRel / recent.length;
  const score = clamp(avgRel * 200);
  return {
    score,
    label: beats >= recent.length / 2 ? 'Beat estimates' : 'Missed estimates',
    detail: `${beats}/${recent.length} quarters beat; avg surprise ${avgRel >= 0 ? '+' : ''}${(avgRel * 100).toFixed(1)}%`,
    available: true,
  };
}

// ─── 8. Analyst consensus (Finnhub recommendation) ────────────────────────
//
// Recommendation array is monthly; we average the last 3 months to smooth
// the single-month noise. Score = (buy-side count − sell-side count) /
// total, scaled to ±100.

export function analystConsensusSignal(recs: Recommendation[]): SignalResult {
  if (!recs.length) return NA;
  const recent = recs.slice(0, 3);
  let buys = 0;
  let sells = 0;
  let total = 0;
  for (const r of recent) {
    const rowTotal = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
    if (rowTotal === 0) continue;
    buys += r.strongBuy + r.buy;
    sells += r.sell + r.strongSell;
    total += rowTotal;
  }
  if (total === 0) return NA;
  const ratio = (buys - sells) / total;
  const score = clamp(ratio * 100);
  return {
    score,
    label: ratio >= 0.2 ? 'Analysts bullish' : ratio <= -0.2 ? 'Analysts bearish' : 'Analyst consensus neutral',
    detail: `${buys} buy / ${sells} sell across ${recent.length} months`,
    available: true,
  };
}
