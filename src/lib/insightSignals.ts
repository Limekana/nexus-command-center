// ─── NCC v1.2 Insights signal engine ───────────────────────────────────────
//
// Five client-side technical/sentiment signals computed from existing Yahoo
// chart data + filtered news headlines. No new data providers, no paid APIs.
//
// Each signal returns a structured result with:
//   - score: number in [-100, +100]. Positive = bullish, negative = bearish,
//            zero = neutral. The composite combines these into a single
//            number via weighted average.
//   - label: short tag for the UI (e.g. "RSI oversold", "SMA bull cross").
//   - detail: one-line numeric breakdown for the breakdown sheet
//             (e.g. "RSI 28 — below 30 oversold threshold").
//   - available: false if input data was insufficient. Composite skips
//                unavailable signals and renormalizes the weights.
//
// All signals are PURE functions of their inputs. No async, no side effects.
// That makes them trivially unit-testable and lets the composite call them
// from any context (Insights tab cold load, holding row pill, notification
// re-tick on resume).

import type { YahooHistoryBar } from '../api/yahoo';

export interface SignalResult {
  /** [-100, +100] — positive bullish, negative bearish, 0 neutral. */
  score: number;
  /** UI tag for the breakdown sheet. */
  label: string;
  /** One-line numeric explanation. */
  detail: string;
  /** False when the input data couldn't drive the signal — composite skips. */
  available: boolean;
}

// ─── RSI(14) ───────────────────────────────────────────────────────────────
//
// Standard 14-period Wilder RSI. We score symmetrically around the canonical
// 30/70 oversold/overbought levels:
//   - RSI <= 30: oversold → +score (mean-reversion buy signal)
//   - RSI >= 70: overbought → -score
//   - 30 < RSI < 70: linear interpolation toward 0
// Sub-30 maps -100 floor at RSI=10; super-70 maps +100 ceiling at RSI=90.
// Inverted: low RSI = bullish (overbought = bearish).

export function rsiSignal(bars: YahooHistoryBar[]): SignalResult {
  const closes = bars.map((b) => b.close);
  if (closes.length < 15) {
    return { score: 0, label: 'RSI(14)', detail: 'Not enough data', available: false };
  }
  // Initial average gain/loss over the first 14 changes (closes[1..14]).
  let gain = 0, loss = 0;
  for (let i = 1; i <= 14; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff; else loss -= diff;
  }
  let avgGain = gain / 14;
  let avgLoss = loss / 14;
  // Wilder smoothing over the remaining bars — extends the initial averages
  // by (n-1) factor each step rather than a flat re-window.
  for (let i = 15; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff >= 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  // Map to score with inverted semantics — low RSI = bullish.
  // RSI 30 → 0 boundary; RSI 50 → 0 baseline; RSI 70 → 0 boundary.
  let score = 0;
  let label = 'RSI(14) neutral';
  if (rsi <= 30) {
    // 10 → +100, 30 → 0
    score = clamp((30 - rsi) * 5, 0, 100);
    label = 'RSI oversold';
  } else if (rsi >= 70) {
    // 70 → 0, 90 → -100
    score = clamp((70 - rsi) * 5, -100, 0);
    label = 'RSI overbought';
  } else {
    // Slight tilt in the 30-70 band — RSI 50 = 0, RSI 60 ≈ -25, RSI 40 ≈ +25.
    score = clamp((50 - rsi) * 2.5, -25, 25);
  }
  return {
    score,
    label,
    detail: `RSI ${rsi.toFixed(1)} · ${rsi <= 30 ? 'below 30 oversold' : rsi >= 70 ? 'above 70 overbought' : 'mid-range'}`,
    available: true,
  };
}

// ─── 20/50 SMA crossover ──────────────────────────────────────────────────
//
// SMA20 above SMA50 = uptrend (bullish, +score). The further apart, the
// stronger the signal — relative gap as a percentage of the SMA50.
// Also detects fresh crosses: if the cross happened within the last 5 bars,
// the signal magnitude gets a boost to flag the regime change.

export function smaCrossSignal(bars: YahooHistoryBar[]): SignalResult {
  const closes = bars.map((b) => b.close);
  if (closes.length < 50) {
    return { score: 0, label: 'SMA cross', detail: 'Not enough data', available: false };
  }
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const lastSma20 = sma20[sma20.length - 1];
  const lastSma50 = sma50[sma50.length - 1];
  const gapPct = ((lastSma20 - lastSma50) / lastSma50) * 100;

  // Map ±10% gap to ±100 score, linearly. Most large-cap stocks stay within
  // ±5% in normal markets; ±10% is genuinely strong trend.
  let score = clamp(gapPct * 10, -100, 100);

  // Fresh-cross boost: scan last 5 bars for a sign flip. If found, push
  // the signal another 15 points (capped to ±100). This makes a brand-new
  // golden/death cross noticeable in the pill.
  const window20 = sma20.slice(-6);
  const window50 = sma50.slice(-6);
  let freshCross: 'golden' | 'death' | null = null;
  for (let i = 1; i < window20.length; i++) {
    const prevDiff = window20[i - 1] - window50[i - 1];
    const curDiff = window20[i] - window50[i];
    if (prevDiff < 0 && curDiff >= 0) freshCross = 'golden';
    if (prevDiff > 0 && curDiff <= 0) freshCross = 'death';
  }
  if (freshCross === 'golden') score = clamp(score + 15, -100, 100);
  if (freshCross === 'death') score = clamp(score - 15, -100, 100);

  const label = freshCross === 'golden'
    ? 'SMA golden cross'
    : freshCross === 'death'
      ? 'SMA death cross'
      : gapPct >= 0
        ? 'SMA20 above SMA50'
        : 'SMA20 below SMA50';

  return {
    score,
    label,
    detail: `SMA20 ${lastSma20.toFixed(2)} vs SMA50 ${lastSma50.toFixed(2)} · ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}%`,
    available: true,
  };
}

// ─── Price momentum vs 52-week high ───────────────────────────────────────
//
// Two trailing returns blended:
//   - 14d return — short-term momentum
//   - 30d return — medium-term momentum
// Plus a "distance from 52w high" component (closer to high = stronger momentum).
//
// We blend 60/40 momentum/distance because the trailing-return component
// captures the "what's it doing right now" question more directly than the
// 52w-high one alone (which lags through a long pullback).

export function momentumSignal(bars: YahooHistoryBar[], high52w: number | undefined): SignalResult {
  if (bars.length < 30) {
    return { score: 0, label: 'Momentum', detail: 'Not enough data', available: false };
  }
  const last = bars[bars.length - 1].close;
  const close14d = bars[bars.length - 15].close;
  const close30d = bars[bars.length - 31].close;
  const ret14 = ((last - close14d) / close14d) * 100;
  const ret30 = ((last - close30d) / close30d) * 100;
  // Average the two windows — equal weight gives a steady-state read.
  const avgRet = (ret14 + ret30) / 2;

  // Distance from 52w high — 0% (at high) = strongest, -50% (halved) = weakest.
  // Map 0 → +50, -50 → -50, with -25 ≈ 0 baseline.
  let distScore = 0;
  if (typeof high52w === 'number' && high52w > 0) {
    const distPct = ((last - high52w) / high52w) * 100; // typically negative
    distScore = clamp((distPct + 20) * 2.5, -50, 50);
  }

  // Blend: 60% trailing-return, 40% distance. Trailing-return mapped at
  // ±25% to ±100 — large-cap stocks rarely sustain ±25% over 30d.
  const retScore = clamp(avgRet * 4, -100, 100);
  const score = retScore * 0.6 + distScore * 0.4;

  const label = avgRet > 5 ? 'Strong momentum' : avgRet < -5 ? 'Weak momentum' : 'Flat momentum';
  const distHint = typeof high52w === 'number'
    ? ` · ${(((last - high52w) / high52w) * 100).toFixed(1)}% from 52w high`
    : '';

  return {
    score: clamp(score, -100, 100),
    label,
    detail: `14d ${ret14.toFixed(1)}% · 30d ${ret30.toFixed(1)}%${distHint}`,
    available: true,
  };
}

// ─── Volume pressure ──────────────────────────────────────────────────────
//
// Over the last 20 sessions, compare cumulative volume on up days vs down
// days. More up-day volume = bullish (institutional buying). More down-day
// volume = bearish (distribution).
//
// Score = (upVol - downVol) / (upVol + downVol) * 100, so it lands in
// [-100, +100] naturally. We require at least 10 bars with valid volume to
// emit a result; many international tickers don't report volume reliably
// and we'd rather skip the signal than mislead.

export function volumeSignal(bars: YahooHistoryBar[]): SignalResult {
  const window = bars.slice(-21); // 21 bars → 20 returns
  let upVol = 0, downVol = 0, validBars = 0;
  for (let i = 1; i < window.length; i++) {
    const prevClose = window[i - 1].close;
    const close = window[i].close;
    const volume = window[i].volume;
    if (volume == null || !Number.isFinite(volume)) continue;
    validBars++;
    if (close >= prevClose) upVol += volume;
    else downVol += volume;
  }
  if (validBars < 10) {
    return { score: 0, label: 'Volume', detail: 'Volume data unavailable', available: false };
  }
  const total = upVol + downVol;
  if (total === 0) {
    return { score: 0, label: 'Volume flat', detail: 'No volume in window', available: true };
  }
  const score = ((upVol - downVol) / total) * 100;
  const label = score > 20 ? 'Bullish volume' : score < -20 ? 'Bearish volume' : 'Mixed volume';
  return {
    score,
    label,
    detail: `Up:${shortVolume(upVol)} · Down:${shortVolume(downVol)} (last ${validBars}d)`,
    available: true,
  };
}

// ─── News sentiment ───────────────────────────────────────────────────────
//
// Keyword score on already-relevance-filtered headlines. We deliberately
// don't ship a real NLP model — a curated keyword set is more honest about
// the lo-fi nature of the signal and stays within bundle-size constraints.
//
// Each headline + summary is scored:
//   +1 per bullish keyword (e.g. "raises guidance", "beats", "upgrades")
//   -1 per bearish keyword (e.g. "lowers", "misses", "downgrade", "lawsuit")
// Final score per headline clamped to [-3, +3]. Headlines averaged, then
// mapped to [-100, +100]. Empty headline list → unavailable.

interface NewsItemForSentiment {
  headline: string;
  summary?: string;
}

const BULLISH = [
  'beats', 'beat estimates', 'raises guidance', 'upgrade', 'upgraded',
  'outperform', 'outperformed', 'strong', 'record', 'surge', 'soar',
  'rally', 'breakout', 'jumps', 'gains', 'rebound', 'momentum',
  'buy rating', 'price target raised', 'upbeat', 'optimistic',
  'partnership', 'acquisition', 'expand', 'expansion', 'launch',
  'profitable', 'profit', 'growth', 'innovate', 'innovation',
];
const BEARISH = [
  'misses', 'miss estimates', 'lowers guidance', 'downgrade', 'downgraded',
  'underperform', 'weak', 'plunge', 'plummet', 'tumble', 'slide',
  'falls', 'losses', 'cut', 'cuts', 'reduces',
  'sell rating', 'price target lowered', 'bearish', 'pessimistic',
  'lawsuit', 'investigation', 'probe', 'recall', 'fraud',
  'layoff', 'layoffs', 'job cuts', 'closing', 'bankrupt', 'bankruptcy',
  'warning', 'risk', 'concerns', 'concern',
];

export function sentimentSignal(headlines: NewsItemForSentiment[]): SignalResult {
  if (headlines.length === 0) {
    return { score: 0, label: 'Sentiment', detail: 'No recent news', available: false };
  }
  let bullishHits = 0, bearishHits = 0;
  let perItemScores = 0;
  for (const item of headlines) {
    const text = `${item.headline} ${item.summary ?? ''}`.toLowerCase();
    let s = 0;
    for (const kw of BULLISH) if (text.includes(kw)) { s++; bullishHits++; }
    for (const kw of BEARISH) if (text.includes(kw)) { s--; bearishHits++; }
    perItemScores += clamp(s, -3, 3);
  }
  const avg = perItemScores / headlines.length;
  // Map ±3 average → ±100.
  const score = clamp(avg * 33, -100, 100);
  const label = score > 20 ? 'Bullish news' : score < -20 ? 'Bearish news' : 'Mixed news';
  return {
    score,
    label,
    detail: `${headlines.length} headlines · ${bullishHits} bullish / ${bearishHits} bearish keywords`,
    available: true,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Trailing simple moving average. Returns an array of the same length as
 *  input, with the first (period - 1) values being NaN (callers should slice
 *  off the leading NaNs or read only from index `period - 1` onward). */
function sma(arr: number[], period: number): number[] {
  const out: number[] = new Array(arr.length).fill(NaN);
  if (arr.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < arr.length; i++) {
    sum += arr[i] - arr[i - period];
    out[i] = sum / period;
  }
  return out;
}

function shortVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}
