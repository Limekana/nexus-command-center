import { describe, it, expect } from 'vitest';
import {
  lotRemaining,
  totalRemainingShares,
  computeSale,
  saleCostBasisInCurrency,
  applySoldShares,
} from './stockSaleFifo';
import type { PortfolioLot, StockSale, LotAllocation } from '../types/finance';

// Characterization tests (v1.16, limecore#11). FIFO cost basis decides the
// realized gain a user sees and keeps for tax purposes — the one place in NCC
// where a refactor that changes a number is a real-world problem rather than a
// cosmetic one. These pin current behaviour, including the documented
// edge cases (undated lots sort last, cross-currency lots convert before
// summing, soldShares is derived and never stored authoritatively).

function lot(over: Partial<PortfolioLot> & Pick<PortfolioLot, 'id' | 'quantity' | 'costPerUnit'>): PortfolioLot {
  return {
    holdingId: 'h1',
    costCurrency: 'EUR',
    syncStatus: 'synced',
    ...over,
  } as PortfolioLot;
}

describe('lotRemaining', () => {
  it('nets sold shares out of the lot quantity', () => {
    expect(lotRemaining(lot({ id: 'l1', quantity: 10, costPerUnit: 5, soldShares: 4 }))).toBe(6);
  });

  it('treats a missing soldShares as zero', () => {
    expect(lotRemaining(lot({ id: 'l1', quantity: 10, costPerUnit: 5 }))).toBe(10);
  });

  it('never returns a negative remainder', () => {
    expect(lotRemaining(lot({ id: 'l1', quantity: 10, costPerUnit: 5, soldShares: 99 }))).toBe(0);
  });
});

describe('totalRemainingShares', () => {
  it('sums the remainder across lots', () => {
    expect(
      totalRemainingShares([
        lot({ id: 'l1', quantity: 10, costPerUnit: 5, soldShares: 4 }),
        lot({ id: 'l2', quantity: 5, costPerUnit: 7 }),
      ]),
    ).toBe(11);
  });

  it('is zero for no lots', () => {
    expect(totalRemainingShares([])).toBe(0);
  });
});

describe('computeSale', () => {
  const lots = [
    lot({ id: 'old', quantity: 10, costPerUnit: 10, purchaseDate: '2026-01-01' }),
    lot({ id: 'new', quantity: 10, costPerUnit: 20, purchaseDate: '2026-06-01' }),
  ];

  it('consumes the oldest lot first', () => {
    const r = computeSale('AAPL', 5, lots);
    expect(r.lotAllocations).toEqual([{ lotId: 'old', sharesTaken: 5 }]);
    expect(r.costBasisPerShare).toBe(10);
    expect(r.remainingShares).toBe(15);
  });

  it('spans lots and weights the cost basis across them', () => {
    const r = computeSale('AAPL', 15, lots);
    expect(r.lotAllocations).toEqual([
      { lotId: 'old', sharesTaken: 10 },
      { lotId: 'new', sharesTaken: 5 },
    ]);
    // (10×10 + 5×20) / 15
    expect(r.costBasisPerShare).toBeCloseTo(200 / 15, 10);
    expect(r.remainingShares).toBe(5);
  });

  it('skips a lot that is already fully sold', () => {
    const r = computeSale('AAPL', 5, [
      lot({ id: 'spent', quantity: 10, costPerUnit: 1, purchaseDate: '2026-01-01', soldShares: 10 }),
      lot({ id: 'live', quantity: 10, costPerUnit: 20, purchaseDate: '2026-06-01' }),
    ]);
    expect(r.lotAllocations).toEqual([{ lotId: 'live', sharesTaken: 5 }]);
    expect(r.costBasisPerShare).toBe(20);
  });

  it('sorts an undated lot last, so a dated lot is always consumed first', () => {
    const r = computeSale('AAPL', 5, [
      lot({ id: 'undated', quantity: 10, costPerUnit: 99 }),
      lot({ id: 'dated', quantity: 10, costPerUnit: 10, purchaseDate: '2026-06-01' }),
    ]);
    expect(r.lotAllocations).toEqual([{ lotId: 'dated', sharesTaken: 5 }]);
  });

  it('breaks a same-date tie by createdAt for determinism', () => {
    const r = computeSale('AAPL', 5, [
      lot({ id: 'second', quantity: 10, costPerUnit: 20, purchaseDate: '2026-01-01', createdAt: '2026-01-01T12:00:00Z' }),
      lot({ id: 'first', quantity: 10, costPerUnit: 10, purchaseDate: '2026-01-01', createdAt: '2026-01-01T09:00:00Z' }),
    ]);
    expect(r.lotAllocations).toEqual([{ lotId: 'first', sharesTaken: 5 }]);
  });

  it('allows selling the entire position', () => {
    const r = computeSale('AAPL', 20, lots);
    expect(r.remainingShares).toBe(0);
    expect(r.lotAllocations).toHaveLength(2);
  });

  it('throws on an oversell rather than allocating what it can', () => {
    expect(() => computeSale('AAPL', 21, lots)).toThrow(/only 20 held/);
  });

  it('throws on a zero or negative quantity', () => {
    expect(() => computeSale('AAPL', 0, lots)).toThrow(/greater than zero/);
    expect(() => computeSale('AAPL', -1, lots)).toThrow(/greater than zero/);
  });

  it('tolerates floating-point dust at the exact-sell boundary', () => {
    // 0.1 + 0.2 lots vs a 0.30000000000000004 sell: the EPS guard is what stops
    // "sell all" throwing on a position the UI just told the user they hold.
    const dusty = [
      lot({ id: 'a', quantity: 0.1, costPerUnit: 1, purchaseDate: '2026-01-01' }),
      lot({ id: 'b', quantity: 0.2, costPerUnit: 1, purchaseDate: '2026-02-01' }),
    ];
    expect(() => computeSale('AAPL', 0.1 + 0.2, dusty)).not.toThrow();
  });
});

describe('saleCostBasisInCurrency', () => {
  const lots = [
    lot({ id: 'eur', quantity: 10, costPerUnit: 10, costCurrency: 'EUR' }),
    lot({ id: 'usd', quantity: 10, costPerUnit: 10, costCurrency: 'USD' }),
  ];
  const allocations: LotAllocation[] = [
    { lotId: 'eur', sharesTaken: 2 },
    { lotId: 'usd', sharesTaken: 2 },
  ];
  // Halves USD→EUR so a conversion is unmistakable in the total.
  const convert = (amount: number, from: string, to: string) =>
    from === to ? amount : from === 'USD' && to === 'EUR' ? amount / 2 : null;

  it('converts a foreign-currency lot before summing', () => {
    // 2×10 EUR + (2×10 USD → 10 EUR) = 30, not the naive 40.
    expect(saleCostBasisInCurrency(lots, allocations, 'EUR', convert)).toBe(30);
  });

  it('skips conversion entirely for a same-currency lot', () => {
    const calls: string[] = [];
    const spy = (a: number, f: string, t: string) => {
      calls.push(`${f}->${t}`);
      return a;
    };
    saleCostBasisInCurrency(lots, [{ lotId: 'eur', sharesTaken: 2 }], 'EUR', spy);
    expect(calls).toEqual([]);
  });

  it('falls back to the native amount when no rate is available', () => {
    // Documented best-effort behaviour: an unavailable rate keeps the
    // pre-fix number rather than dropping the lot from the basis.
    expect(saleCostBasisInCurrency(lots, allocations, 'GBP', () => null)).toBe(40);
  });

  it('ignores an allocation pointing at a lot that no longer exists', () => {
    expect(
      saleCostBasisInCurrency(lots, [{ lotId: 'deleted', sharesTaken: 5 }], 'EUR', convert),
    ).toBe(0);
  });
});

describe('applySoldShares', () => {
  const lots = [
    lot({ id: 'l1', quantity: 10, costPerUnit: 1 }),
    lot({ id: 'l2', quantity: 10, costPerUnit: 1 }),
  ];

  function sale(allocations: LotAllocation[]): StockSale {
    return { id: `s${Math.random()}`, lotAllocations: allocations } as unknown as StockSale;
  }

  it('accumulates allocations across several sales', () => {
    const out = applySoldShares(lots, [
      sale([{ lotId: 'l1', sharesTaken: 3 }]),
      sale([{ lotId: 'l1', sharesTaken: 2 }, { lotId: 'l2', sharesTaken: 1 }]),
    ]);
    expect(out.map((l) => l.soldShares)).toEqual([5, 1]);
  });

  it('resets a lot with no sales to zero rather than leaving a stale value', () => {
    const stale = [lot({ id: 'l1', quantity: 10, costPerUnit: 1, soldShares: 7 })];
    expect(applySoldShares(stale, [])[0].soldShares).toBe(0);
  });

  it('does not mutate the input lots', () => {
    const input = [lot({ id: 'l1', quantity: 10, costPerUnit: 1, soldShares: 0 })];
    applySoldShares(input, [sale([{ lotId: 'l1', sharesTaken: 4 }])]);
    expect(input[0].soldShares).toBe(0);
  });

  it('tolerates a sale with no allocations recorded', () => {
    const out = applySoldShares(lots, [{ id: 's1' } as unknown as StockSale]);
    expect(out.map((l) => l.soldShares)).toEqual([0, 0]);
  });
});

describe('FIFO round trip', () => {
  it('keeps remaining shares consistent after a sale is applied back to the lots', () => {
    const lots = [
      lot({ id: 'a', quantity: 10, costPerUnit: 10, purchaseDate: '2026-01-01' }),
      lot({ id: 'b', quantity: 10, costPerUnit: 20, purchaseDate: '2026-06-01' }),
    ];
    const first = computeSale('AAPL', 12, lots);
    const afterFirst = applySoldShares(lots, [
      { id: 's1', lotAllocations: first.lotAllocations } as unknown as StockSale,
    ]);
    expect(totalRemainingShares(afterFirst)).toBe(first.remainingShares);

    // A second sale must consume only what the first left behind.
    const second = computeSale('AAPL', 8, afterFirst);
    expect(second.lotAllocations).toEqual([{ lotId: 'b', sharesTaken: 8 }]);
    expect(second.remainingShares).toBe(0);
  });
});
