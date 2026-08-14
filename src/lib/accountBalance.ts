// ─── v1.2 follow-up — Account balance derivation ────────────────────────
//
// Pure functions. Compute an account's current balance from its
// `startingBalance` plus the signed sum of every Transaction that touches
// it. The math:
//
//   derivedBalance(account, txns) =
//     startingBalance
//     + Σ(income.amount  where t.accountId === account.id)
//     − Σ(expense.amount where t.accountId === account.id)
//     − Σ(transfer.amount where t.accountId === account.id)
//     + Σ(transfer.amount where t.destinationAccountId === account.id)
//
// Cross-currency: transactions are recorded in baseCurrency. The account
// has its own `currency`. To project a transaction's effect onto an
// account, we convert from baseCurrency → account.currency at READ time
// using the current fxRates snapshot. If the rate is missing, the
// transaction is skipped (with the id added to `unconvertableTxns` so the
// caller can surface a soft warning).
//
// This lives in lib/ (not the store) because it's pure — easy to test,
// easy to memoize at the screen level, no Dexie / Zustand coupling.

import { convertSync } from '../api/fxRates';
import type { Account, Transaction } from '../types/finance';

interface AccountBalanceResult {
  /** Final balance in the account's own currency. */
  balance: number;
  /** Starting balance (echoed back for convenience — the running-balance
   *  list view subtracts current balance from this to display the net
   *  change since account creation). */
  startingBalance: number;
  /** Signed sum of all transaction deltas applied (in account.currency). */
  txnDelta: number;
  /** Number of transactions that contributed to the delta. */
  txnCount: number;
  /** Transaction IDs that couldn't be FX-converted to the account's
   *  currency. Surface as a soft warning on the AccountDetail screen so
   *  the user knows the balance is potentially understated. */
  unconvertableTxns: string[];
}

/**
 * Compute one account's derived balance. Pure. The caller passes the live
 * transactions slice; we filter internally so the helper stays single-arg
 * and easy to call from selectors.
 *
 * `baseCurrency` is the user's display currency (transactions are recorded
 * in this currency). We convert each transaction amount from baseCurrency
 * → account.currency before applying.
 */
export function computeAccountBalance(
  account: Account,
  transactions: Transaction[],
  fxRates: Record<string, number> | null,
  baseCurrency: string,
): AccountBalanceResult {
  let delta = 0;
  let count = 0;
  const unconvertable: string[] = [];

  // Helper — convert a baseCurrency amount into account.currency, returning
  // null when the rate is missing.
  const convert = (amount: number): number | null => {
    if (baseCurrency === account.currency) return amount;
    return convertSync(amount, baseCurrency, account.currency, fxRates);
  };

  for (const t of transactions) {
    let signed: number | null = null;
    if (t.type === 'expense' && t.accountId === account.id) {
      const c = convert(t.amount);
      signed = c == null ? null : -c;
    } else if (t.type === 'income' && t.accountId === account.id) {
      const c = convert(t.amount);
      signed = c == null ? null : c;
    } else if (t.type === 'transfer') {
      if (t.accountId === account.id) {
        const c = convert(t.amount);
        signed = c == null ? null : -c;
      } else if (t.destinationAccountId === account.id) {
        const c = convert(t.amount);
        signed = c == null ? null : c;
      }
    }
    if (signed == null) {
      // Only count as unconvertable if it would otherwise have contributed.
      const touches =
        (t.type !== 'transfer' && t.accountId === account.id) ||
        (t.type === 'transfer' &&
          (t.accountId === account.id || t.destinationAccountId === account.id));
      if (touches) unconvertable.push(t.id);
      continue;
    }
    delta += signed;
    count += 1;
  }

  return {
    balance: account.startingBalance + delta,
    startingBalance: account.startingBalance,
    txnDelta: delta,
    txnCount: count,
    unconvertableTxns: unconvertable,
  };
}

