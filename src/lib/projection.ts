// Compound-growth projection for the What-If simulator. Pure math, zero
// dependencies, fully unit-testable in isolation.
//
// Formula:
//   At each month, the balance grows by the monthly rate and the user's
//   monthly contribution is added. We snapshot at year boundaries so the
//   chart has manageable data points (max 41 points for a 40-year horizon).
//
// Honest disclaimers we render in the UI but bake into the math here too:
//   - All rates are NOMINAL by default. Inflation eats real purchasing power.
//   - Markets don't return smoothly. A 7% average can be -20%/+30%/+5%/...
//     We're modeling the smooth average — useful for planning, not for
//     predicting any specific year.
//   - Taxes and fees aren't modeled. Real-world returns are lower.

export interface ProjectionPoint {
  yearIndex: number;       // 0 = today, 1 = 1 year from now, …
  date: Date;              // exact date for this snapshot (anniversary of today)
  balanceNominal: number;  // raw projected balance in input currency
  balanceReal: number;     // same balance deflated by inflation (today's money)
}

export interface ProjectionInput {
  startingBalance: number;
  monthlyContribution: number;
  annualReturnRate: number; // 0.07 = 7%
  years: number;            // 1–40 typically
  annualInflationRate: number; // 0.02 = 2% default; used only for `balanceReal`
}

export interface ProjectionResult {
  points: ProjectionPoint[];
  // Convenience: the final point for quick "in X years you have €Y" display.
  finalNominal: number;
  finalReal: number;
  // Total contributions across the horizon (years * 12 * monthly). Useful
  // for sanity-checking "is this growth or am I just saving more?"
  totalContributions: number;
}

export function project(input: ProjectionInput): ProjectionResult {
  const { startingBalance, monthlyContribution, annualReturnRate, years, annualInflationRate } = input;
  // Convert annual → monthly via geometric mean (the right way; simple
  // division would slightly overshoot the annual target).
  const monthlyRate = Math.pow(1 + annualReturnRate, 1 / 12) - 1;
  const points: ProjectionPoint[] = [];

  // Snapshot at month 0 (today).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  points.push({
    yearIndex: 0,
    date: new Date(today),
    balanceNominal: startingBalance,
    balanceReal: startingBalance,
  });

  let balance = startingBalance;
  for (let m = 1; m <= years * 12; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (m % 12 === 0) {
      const yearIndex = m / 12;
      const snapDate = new Date(today);
      snapDate.setFullYear(today.getFullYear() + yearIndex);
      // Deflate nominal balance by cumulative inflation to express in
      // "today's money" — the more honest number for long horizons.
      const deflator = Math.pow(1 + annualInflationRate, yearIndex);
      points.push({
        yearIndex,
        date: snapDate,
        balanceNominal: balance,
        balanceReal: balance / deflator,
      });
    }
  }

  return {
    points,
    finalNominal: balance,
    finalReal: balance / Math.pow(1 + annualInflationRate, years),
    totalContributions: monthlyContribution * years * 12,
  };
}

/**
 * First year at which a projection reaches the target (in nominal terms).
 * Returns null if the projection never hits the target within its horizon.
 */
export function yearReachingMilestone(
  points: ProjectionPoint[],
  target: number,
  inToday: boolean,
): number | null {
  for (const p of points) {
    const v = inToday ? p.balanceReal : p.balanceNominal;
    if (v >= target) return p.yearIndex;
  }
  return null;
}
