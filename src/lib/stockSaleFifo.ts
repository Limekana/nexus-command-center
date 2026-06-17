// ─── v1.3.1 (BUG-23) FIFO cost-basis helper for stock sales ────────────────
//
// Pure functions — no store/Dexie coupling — so they're trivially testable and
// reusable from the sale form (preview) and the store (commit).
//
// `soldShares` is treated as DERIVED from stock_sales.lotAllocations rather
// than a separately-synced lot column: the cloud `portfolio_lots` table has no
// sold-shares field, so deriving keeps every device consistent from the synced
// sales alone. `applySoldShares` rebuilds it; `computeSale` reads the current
// remainder via `lotRemaining`.

import type { PortfolioLot, StockSale, LotAllocation } from '../types/finance';

const EPS = 1e-9;

/** Still-held shares for a single lot (never negative). */
export function lotRemaining(lot: PortfolioLot): number {
  return Math.max(0, lot.quantity - (lot.soldShares ?? 0));
}

/** Total still-held shares across a set of lots (one holding's worth). */
export function totalRemainingShares(lots: PortfolioLot[]): number {
  return lots.reduce((sum, l) => sum + lotRemaining(l), 0);
}

export interface SaleComputation {
  /** Weighted-average cost of the shares being sold (FIFO). */
  costBasisPerShare: number;
  /** Which lots supplied the sold shares + how many — the audit trail. */
  lotAllocations: LotAllocation[];
  /** Shares still held across the holding AFTER this sale lands. */
  remainingShares: number;
}

/**
 * Compute the FIFO cost basis for selling `sharesToSell` of a ticker.
 * Consumes the oldest lots first (by purchaseDate, then createdAt). Throws if
 * the holding doesn't have enough remaining shares — the UI validates before
 * calling, this is the defensive backstop.
 */
export function computeSale(
  _ticker: string,
  sharesToSell: number,
  lots: PortfolioLot[],
): SaleComputation {
  if (!(sharesToSell > 0)) {
    throw new Error('Shares to sell must be greater than zero.');
  }
  const available = totalRemainingShares(lots);
  if (sharesToSell > available + EPS) {
    throw new Error(
      `Cannot sell ${sharesToSell} shares — only ${available} held.`,
    );
  }
  // FIFO: oldest purchase first. Undated lots sort last (treated as newest) so
  // a dated lot is always consumed before an undated synthesized one; ties
  // break by createdAt for determinism.
  const sorted = [...lots].sort((a, b) => {
    const ad = a.purchaseDate ?? '9999-12-31';
    const bd = b.purchaseDate ?? '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  });

  let need = sharesToSell;
  let costAccum = 0;
  const lotAllocations: LotAllocation[] = [];
  for (const lot of sorted) {
    if (need <= EPS) break;
    const avail = lotRemaining(lot);
    if (avail <= 0) continue;
    const take = Math.min(avail, need);
    lotAllocations.push({ lotId: lot.id, sharesTaken: take });
    costAccum += take * lot.costPerUnit;
    need -= take;
  }

  return {
    costBasisPerShare: sharesToSell > 0 ? costAccum / sharesToSell : 0,
    lotAllocations,
    remainingShares: available - sharesToSell,
  };
}

/**
 * Rebuild each lot's `soldShares` from the sales' lotAllocations. Returns a new
 * lot array (does not mutate). The single place soldShares is computed, so the
 * value can never drift from the sales that produced it.
 */
export function applySoldShares(
  lots: PortfolioLot[],
  sales: StockSale[],
): PortfolioLot[] {
  const sold = new Map<string, number>();
  for (const s of sales) {
    for (const a of s.lotAllocations ?? []) {
      sold.set(a.lotId, (sold.get(a.lotId) ?? 0) + a.sharesTaken);
    }
  }
  return lots.map((l) => ({ ...l, soldShares: sold.get(l.id) ?? 0 }));
}
