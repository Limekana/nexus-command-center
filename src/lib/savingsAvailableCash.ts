// ─── v1.2 Savings Goals — available cash helper ─────────────────────────
//
// Pure function. Takes the live ManualAssets, fxRates snapshot, baseCurrency,
// and active SavingsGoals — returns the available cash in baseCurrency.
//
// v1.2 follow-up — BUG-5. The buffer is now sourced from the pinned
// `isBuffer: true` goal's `allocatedAmount` instead of a separate settings
// scalar. This single-sources the buffer concept so Net Worth's runway card
// and Savings Goals' "available to allocate" math agree by construction.
// The buffer goal is excluded from `allocatedBase` to avoid double-counting
// (it IS the buffer; subtracting both would carve off the same money twice).
//
// v1.15 fix — liquid is the DERIVED balance (opening balance + every
// transaction, lib/accountBalance.ts), not the stored `value`. Since the v1.2
// Account refactor `value` mirrors the OPENING balance only: a portfolio
// deposit lowers it while the income booked to the account is counted only
// in the derived balance, so reading `value` showed an owner's savings
// account at −2,804 € when it actually held +345.78 €. The account set and the
// balance now match Net Worth's liquid figure exactly — cash, savings and
// checking, archived accounts excluded — so the two screens cannot disagree.
//
// Math:
//   liquidBase = Σ convert(derivedBalance(account), account.currency, base)
//                for non-archived cash/savings/checking accounts
//   bufferAmount = convert(bufferGoal.allocatedAmount, bufferGoal.currency, base)
//   allocatedBase = Σ convert(goal.allocatedAmount, goal.currency, base)
//                    for goal in non-buffer, non-deleted goals
//   available = liquidBase − bufferAmount − allocatedBase
//
// Negative `available` means the user has over-allocated (buffer + goals
// exceed liquid cash). The UI surfaces this as a red warning rather than
// blocking allocations — the user might be planning ahead of an upcoming
// paycheck and we don't want to be paternalistic.
//
// Cross-currency note: when fxRates lacks a rate for some pair we treat
// that asset/goal as contributing 0 to its side of the balance, but log
// it via `unconvertable` in the return for UI diagnostics.

import { convertSync } from '../api/fxRates';
import { computeAccountBalance } from './accountBalance';
import type { ManualAsset, SavingsGoal, Transaction } from '../types/finance';

/** Same set Net Worth's liquid figure uses (NetWorth.tsx LIQUID_TYPES). */
export const LIQUID_ACCOUNT_TYPES = new Set(['cash', 'savings', 'checking']);

/** Is this account liquid cash? Canonical `accountType` first, legacy
 *  `assetType` for rows written before the dual-field transition. */
export function isLiquidAccount(a: ManualAsset): boolean {
  if (a.archivedAt) return false;
  return LIQUID_ACCOUNT_TYPES.has(a.accountType ?? a.assetType);
}

/** An account's derived balance in its own currency. */
export function liquidBalance(
  a: ManualAsset,
  transactions: Transaction[],
  fxRates: Record<string, number> | null,
  baseCurrency: string,
): number {
  return computeAccountBalance(a, transactions, fxRates, baseCurrency).balance;
}

interface AvailableCashResult {
  /** Total cash+savings in baseCurrency. */
  liquidBase: number;
  /** Total allocated across non-buffer goals in baseCurrency. */
  allocatedBase: number;
  /** Buffer reserved (from the pinned buffer goal, in baseCurrency). */
  bufferAmount: number;
  /** Net pool available to allocate (can be negative if over-allocated). */
  available: number;
  /** Asset / goal IDs we couldn't convert — surfaced as a soft warning. */
  unconvertable: string[];
}

export function computeAvailableCash(
  manualAssets: ManualAsset[],
  goals: SavingsGoal[],
  transactions: Transaction[],
  fxRates: Record<string, number> | null,
  baseCurrency: string,
): AvailableCashResult {
  const unconvertable: string[] = [];

  let liquidBase = 0;
  for (const a of manualAssets) {
    if (!isLiquidAccount(a)) continue;
    const balance = liquidBalance(a, transactions, fxRates, baseCurrency);
    const conv = a.currency === baseCurrency ? balance : convertSync(balance, a.currency, baseCurrency, fxRates);
    if (conv == null) {
      unconvertable.push(`asset:${a.id}`);
      continue;
    }
    liquidBase += conv;
  }

  let bufferAmount = 0;
  let allocatedBase = 0;
  for (const g of goals) {
    if (g.deletedAt) continue;
    const conv = convertSync(g.allocatedAmount, g.currency, baseCurrency, fxRates);
    if (conv == null) {
      unconvertable.push(`goal:${g.id}`);
      continue;
    }
    if (g.isBuffer) {
      bufferAmount += conv;
      continue;
    }
    // Completed (non-buffer) goals still count — that cash is earmarked
    // even if the goal is "done" (e.g. the user hit their down-payment
    // target but hasn't moved the cash yet). Deleting the goal is how the
    // user releases the allocation.
    allocatedBase += conv;
  }

  const available = liquidBase - bufferAmount - allocatedBase;
  return { liquidBase, allocatedBase, bufferAmount, available, unconvertable };
}
