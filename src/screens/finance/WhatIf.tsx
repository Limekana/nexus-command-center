// "What-If" simulator. Project net worth forward with adjustable monthly
// contributions, time horizon, and two return-rate scenarios shown
// side-by-side.
//
// Design choices made explicit in the UI:
//   - TWO scenarios always shown together (conservative vs optimistic).
//     Single-scenario FIRE projections look certain in a way reality isn't.
//     The shaded band between them is the "honest uncertainty" range.
//   - Inflation toggle: nominal balance is the default (matches your bank
//     statement) but "in today's money" is the more useful long-horizon
//     view. Both are computed; the user picks which axis to read.
//   - Starting balance defaults to current net worth — portfolio + manual
//     assets - liabilities — so the projection starts from the user's
//     actual position, not zero.

import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../../components/AppHeader';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { convertSync, normalizeCurrency } from '../../api/fxRates';
import { LIABILITY_TYPES } from '../../types/finance';
import { project, yearReachingMilestone } from '../../lib/projection';

const MILESTONES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

const CONSERVATIVE_DEFAULT = 4;
const OPTIMISTIC_DEFAULT = 7;
const INFLATION_DEFAULT = 2.5;

export default function WhatIf() {
  const holdings = useFinanceStore((s) => s.holdings);
  const stockQuotes = useFinanceStore((s) => s.stockQuotes);
  const cryptoPrices = useFinanceStore((s) => s.cryptoPrices);
  const fxRates = useFinanceStore((s) => s.fxRates);
  const manualAssets = useFinanceStore((s) => s.manualAssets);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);

  // Compute current net worth — same formula as NetWorth.tsx & FinanceOverview.
  const currentNetWorth = useMemo(() => {
    let portfolioBase = 0;
    for (const h of holdings) {
      if (h.assetType === 'stock' || h.assetType === 'etf') {
        const q = stockQuotes.find((s) => s.ticker === h.ticker);
        if (!q) continue;
        const native = normalizeCurrency(q.quote.c * h.quantity, q.currency);
        const conv = convertSync(native.amount, native.currency, baseCurrency, fxRates);
        if (conv != null) portfolioBase += conv;
      } else {
        const p = cryptoPrices?.prices.find((p) => p.id === h.ticker);
        if (!p) continue;
        const native = p.priceEur * h.quantity;
        const conv = baseCurrency === 'EUR' ? native : convertSync(native, 'EUR', baseCurrency, fxRates);
        if (conv != null) portfolioBase += conv;
      }
    }
    let assets = 0;
    let liab = 0;
    for (const a of manualAssets) {
      const conv = convertSync(a.value, a.currency, baseCurrency, fxRates);
      if (conv == null) continue;
      if (LIABILITY_TYPES.includes(a.assetType)) liab += conv;
      else assets += conv;
    }
    return Math.max(0, portfolioBase + assets - liab);
  }, [holdings, stockQuotes, cryptoPrices, fxRates, manualAssets, baseCurrency]);

  // Input state — initialised once from current net worth.
  const [startingBalance, setStartingBalance] = useState<number>(Math.round(currentNetWorth));
  const [monthly, setMonthly] = useState<number>(500);
  const [years, setYears] = useState<number>(20);
  const [conservativePct, setConservativePct] = useState<number>(CONSERVATIVE_DEFAULT);
  const [optimisticPct, setOptimisticPct] = useState<number>(OPTIMISTIC_DEFAULT);
  const [inflationPct, setInflationPct] = useState<number>(INFLATION_DEFAULT);
  const [showInToday, setShowInToday] = useState<boolean>(false);

  // Re-init startingBalance if net worth loads after the screen mounts.
  // We only auto-fill when the user hasn't touched the input — a 0 initial
  // value is a strong signal that net worth wasn't ready on first render.
  useEffect(() => {
    if (startingBalance === 0 && currentNetWorth > 0) {
      setStartingBalance(Math.round(currentNetWorth));
    }
  }, [currentNetWorth, startingBalance]);

  const conservative = useMemo(
    () =>
      project({
        startingBalance,
        monthlyContribution: monthly,
        annualReturnRate: conservativePct / 100,
        years,
        annualInflationRate: inflationPct / 100,
      }),
    [startingBalance, monthly, conservativePct, years, inflationPct],
  );

  const optimistic = useMemo(
    () =>
      project({
        startingBalance,
        monthlyContribution: monthly,
        annualReturnRate: optimisticPct / 100,
        years,
        annualInflationRate: inflationPct / 100,
      }),
    [startingBalance, monthly, optimisticPct, years, inflationPct],
  );

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: baseCurrency,
      maximumFractionDigits: 0,
    }).format(n);

  // Determine which milestones are actually reachable so we don't render
  // "€1M: never" for someone projecting a 5-year horizon — it just clutters.
  const milestoneRows = useMemo(() => {
    return MILESTONES.map((target) => ({
      target,
      conservative: yearReachingMilestone(conservative.points, target, showInToday),
      optimistic: yearReachingMilestone(optimistic.points, target, showInToday),
    })).filter((row) => row.conservative != null || row.optimistic != null);
  }, [conservative, optimistic, showInToday]);

  const finalCons = showInToday ? conservative.finalReal : conservative.finalNominal;
  const finalOpt = showInToday ? optimistic.finalReal : optimistic.finalNominal;

  return (
    <>
      <AppHeader title="What If?" back="/finance/networth" backLabel="Net Worth" showAvatar={false} />
      <div className="space-y-3">
        {/* Inputs */}
        <div className="card space-y-3">
          <div className="font-heading font-semibold text-sm">Scenario</div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Starting balance
              </span>
              <span className="text-[10px] text-text-muted">
                Auto-filled from your net worth
              </span>
            </div>
            <input
              className="input"
              inputMode="numeric"
              value={startingBalance}
              onChange={(e) => setStartingBalance(Number(e.target.value) || 0)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Monthly contribution
              </span>
              <span className="text-xs">{fmtMoney(monthly)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={5000}
              step={50}
              value={monthly}
              onChange={(e) => setMonthly(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Time horizon
              </span>
              <span className="text-xs">{years} years</span>
            </div>
            <input
              type="range"
              min={1}
              max={40}
              step={1}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>

        {/* Return rates */}
        <div className="card space-y-3">
          <div className="font-heading font-semibold text-sm">Return rates · annual %</div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
                Conservative
              </div>
              <div className="flex items-center gap-1">
                <input
                  className="input flex-1"
                  inputMode="decimal"
                  value={conservativePct}
                  onChange={(e) => setConservativePct(Number(e.target.value) || 0)}
                />
                <span className="text-text-muted text-sm">%</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
                Optimistic
              </div>
              <div className="flex items-center gap-1">
                <input
                  className="input flex-1"
                  inputMode="decimal"
                  value={optimisticPct}
                  onChange={(e) => setOptimisticPct(Number(e.target.value) || 0)}
                />
                <span className="text-text-muted text-sm">%</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Inflation assumption
              </span>
              <span className="text-xs">{inflationPct.toFixed(1)}% / yr</span>
            </div>
            <input
              type="range"
              min={0}
              max={6}
              step={0.1}
              value={inflationPct}
              onChange={(e) => setInflationPct(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border/40">
            <div>
              <div className="text-sm">Show in today's money</div>
              <div className="text-[10px] text-text-muted">
                Deflates nominal balance by inflation
              </div>
            </div>
            <button
              onClick={() => setShowInToday((v) => !v)}
              className={`relative w-10 h-6 p-0 rounded-full transition-colors flex-shrink-0 ${
                showInToday ? 'bg-primary' : 'bg-surface2 border border-border'
              }`}
              aria-pressed={showInToday}
            >
              {/* Anchor the knob at left-0.5 (2px) so its rest position is
                * predictable. With a 40px track and a 20px knob, translating
                * 16px puts it 2px from the right edge — symmetric inset. */}
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-text transition-transform ${
                  showInToday ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Chart */}
        <ProjectionChart
          conservative={conservative.points.map((p) =>
            showInToday ? p.balanceReal : p.balanceNominal,
          )}
          optimistic={optimistic.points.map((p) =>
            showInToday ? p.balanceReal : p.balanceNominal,
          )}
          years={years}
        />

        {/* Result summary */}
        <div className="card space-y-2">
          <div className="font-heading font-semibold text-sm">
            In {years} years
            {showInToday && (
              <span className="text-[10px] uppercase tracking-wider text-text-muted ml-2">
                · today's money
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-sm border border-border bg-surface2/40 p-2">
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                Conservative · {conservativePct}%
              </div>
              <div className="font-heading font-bold text-lg">{fmtMoney(finalCons)}</div>
            </div>
            <div className="rounded-sm border border-success/40 bg-success/5 p-2">
              <div className="text-[10px] uppercase tracking-wider text-success">
                Optimistic · {optimisticPct}%
              </div>
              <div className="font-heading font-bold text-lg">{fmtMoney(finalOpt)}</div>
            </div>
          </div>
          <div className="text-[10px] text-text-muted">
            Total contributions over {years} years:{' '}
            <span className="text-text">{fmtMoney(conservative.totalContributions)}</span>
            {' · '}Growth above contributions:{' '}
            <span className="text-text">
              {fmtMoney(finalCons - startingBalance - conservative.totalContributions)}
            </span>{' '}
            – {fmtMoney(finalOpt - startingBalance - optimistic.totalContributions)}
          </div>
        </div>

        {/* Milestones */}
        {milestoneRows.length > 0 && (
          <div className="card">
            <div className="font-heading font-semibold text-sm mb-2">Milestones</div>
            <div className="space-y-1">
              <div className="grid grid-cols-3 gap-2 text-[9px] uppercase tracking-wider text-text-muted pb-1 border-b border-border/40">
                <span>Target</span>
                <span className="text-center">Conservative</span>
                <span className="text-right">Optimistic</span>
              </div>
              {milestoneRows.map((row) => (
                <div key={row.target} className="grid grid-cols-3 gap-2 text-xs py-1">
                  <span className="font-heading">{fmtMoney(row.target)}</span>
                  <span className="text-center text-text-muted">
                    {row.conservative != null ? `in ${row.conservative}y` : '—'}
                  </span>
                  <span className="text-right text-success">
                    {row.optimistic != null ? `in ${row.optimistic}y` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Honesty footnote */}
        <div className="card text-[10px] text-text-muted space-y-1">
          <div className="font-heading uppercase tracking-wider text-[9px] text-text">
            Assumptions you're making
          </div>
          <div>
            • Returns are <span className="text-text">nominal</span> (before inflation). 7%
            nominal ≈ 4.5% real at 2.5% inflation.
          </div>
          <div>• Markets don't return smoothly. A 7% average is wild year-to-year.</div>
          <div>• Taxes and fund fees aren't modeled. Real-world outcomes are lower.</div>
          <div>• Monthly contribution is constant — no raises or career changes.</div>
        </div>
      </div>
    </>
  );
}

/** Two-line projection chart with shaded uncertainty band. */
function ProjectionChart({
  conservative,
  optimistic,
  years,
}: {
  conservative: number[];
  optimistic: number[];
  years: number;
}) {
  const W = 320;
  const H = 140;
  const PAD_L = 4;
  const PAD_R = 4;
  const PAD_T = 8;
  const PAD_B = 16;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Always use the optimistic max for the y-axis upper bound — it's the
  // bigger of the two lines by definition. Start from 0 so the user sees
  // the actual scale of growth, not a misleading zoomed view.
  const yMax = Math.max(...optimistic, 1);
  const yMin = 0;
  const ySpan = yMax - yMin;

  const xs = (i: number, n: number) => PAD_L + (i / Math.max(1, n - 1)) * innerW;
  const ys = (v: number) => PAD_T + innerH - ((v - yMin) / ySpan) * innerH;

  const consPath = conservative
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i, conservative.length)} ${ys(v)}`)
    .join(' ');
  const optPath = optimistic
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i, optimistic.length)} ${ys(v)}`)
    .join(' ');

  // Shaded band: optimistic top → conservative bottom (closed polygon).
  const bandPath =
    optimistic.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i, optimistic.length)} ${ys(v)}`).join(' ') +
    ' ' +
    conservative
      .slice()
      .reverse()
      .map((v, i) => `L ${xs(conservative.length - 1 - i, conservative.length)} ${ys(v)}`)
      .join(' ') +
    ' Z';

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading font-semibold text-sm">Projection</span>
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider">
          <span className="flex items-center gap-1 text-text-muted">
            <span className="inline-block w-2 h-2 rounded-sm bg-text-muted/60" />
            Cons.
          </span>
          <span className="flex items-center gap-1 text-success">
            <span className="inline-block w-2 h-2 rounded-sm bg-success" />
            Opt.
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} className="block">
        {/* Light gridline at 50% so the eye has a reference */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_T + innerH / 2}
          y2={PAD_T + innerH / 2}
          stroke="#30363D"
          strokeDasharray="2 3"
          strokeWidth={0.5}
        />
        <path d={bandPath} fill="rgba(63, 185, 80, 0.10)" />
        <path d={consPath} fill="none" stroke="#7D8590" strokeWidth={1.5} strokeLinejoin="round" />
        <path d={optPath} fill="none" stroke="#3FB950" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[9px] text-text-muted mt-1">
        <span>Today</span>
        <span>+{Math.floor(years / 2)}y</span>
        <span>+{years}y</span>
      </div>
    </div>
  );
}
