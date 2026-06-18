// ─── v1.3.2 — Portfolio cash balance ───────────────────────────────────────
//
// The portfolio cash balance is DERIVED from the append-only cash ledger:
// sum every entry's signed amount, converted to the base currency. Entries are
// already signed (deposits/sells positive, buys/withdrawals negative), so this
// is a plain sum. Entries in a currency we can't convert yet are skipped (the
// caller can flag "partial" by comparing counts if it cares).

import type { PortfolioCashEntry } from '../types/finance';
import { convertSync } from '../api/fxRates';

export function portfolioCashBalance(
  entries: PortfolioCashEntry[],
  baseCurrency: string,
  fxRates: Record<string, number> | null,
): number {
  let total = 0;
  for (const e of entries) {
    const conv =
      e.currency === baseCurrency
        ? e.amount
        : convertSync(e.amount, e.currency, baseCurrency, fxRates);
    if (conv != null) total += conv;
  }
  return total;
}
