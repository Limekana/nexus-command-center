import type { PortfolioHolding, PortfolioLot } from '../types/finance';

// Shares still held in a lot after FIFO sales are netted out. soldShares is
// derived from stock_sales.lotAllocations on load (the cloud lots table has no
// such column), so this is the single arithmetic everyone agrees on.
export function lotRemaining(l: PortfolioLot): number {
  return Math.max(0, l.quantity - (l.soldShares ?? 0));
}

// A position is "closed" (fully exited) when it has at least one recorded lot
// but every share has been sold — net remaining ≈ 0. A brand-new holding with
// no lots yet is NOT closed (you just haven't recorded a purchase). Closed
// positions drop out of the live Portfolio/dividend/manage lists and live in
// their respective archive/closed sections instead.
export function isHoldingClosed(holding: PortfolioHolding, lots: PortfolioLot[]): boolean {
  const hLots = lots.filter((l) => l.holdingId === holding.id);
  if (hLots.length === 0) return false;
  const remaining = hLots.reduce((a, l) => a + lotRemaining(l), 0);
  return remaining <= 1e-9;
}
