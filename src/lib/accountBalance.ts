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
import { LIABILITY_ACCOUNT_TYPES } from '../types/finance';

export interface AccountBalanceResult {
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

/**
 * Batch helper — compute balances for every account in one pass. Used by
 * Net Worth + the account list view. Returns a Map keyed by accountId for
 * O(1) lookup at render time. Internally this is just `computeAccountBalance`
 * per account; the convenience is avoiding the boilerplate at every caller.
 */
export function computeAllAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
  fxRates: Record<string, number> | null,
  baseCurrency: string,
): Map<string, AccountBalanceResult> {
  const out = new Map<string, AccountBalanceResult>();
  for (const a of accounts) {
    out.set(a.id, computeAccountBalance(a, transactions, fxRates, baseCurrency));
  }
  return out;
}

/**
 * Total net worth contribution from a set of accounts, converted to base
 * currency. Liability accounts (credit_card, loan) contribute their balance
 * as-is — by the negative-by-convention rule a credit card owing $2,000 has
 * a balance of -2000, which subtracts from net worth automatically.
 *
 * Archived accounts are EXCLUDED at this layer — the caller decides whether
 * to show or hide archived rows in the per-account list, but Net Worth never
 * counts them.
 */
export function totalAccountNetWorthBase(
  accounts: Account[],
  transactions: Transaction[],
  fxRates: Record<string, number> | null,
  baseCurrency: string,
): { total: number; unconvertableAccounts: string[] } {
  let total = 0;
  const unconvertableAccounts: string[] = [];
  for (const a of accounts) {
    if (a.archivedAt) continue;
    const result = computeAccountBalance(a, transactions, fxRates, baseCurrency);
    // Balance is in account.currency; convert back to baseCurrency for sum.
    const inBase =
      a.currency === baseCurrency
        ? result.balance
        : convertSync(result.balance, a.currency, baseCurrency, fxRates);
    if (inBase == null) {
      unconvertableAccounts.push(a.id);
      continue;
    }
    total += inBase;
  }
  return { total, unconvertableAccounts };
}

/** Convenience predicate — true when the account is a liability type. */
export function isLiabilityAccount(account: Account): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(account.accountType);
}
