// v1.9 Item 14b #2 — where the paycheck actually goes.
//
// The shared aggregation behind the desktop cash-flow diagram AND the trended
// budget-vs-actual view (#6). The build plan is explicit that these two read
// the same category-flow data and should be built once and rendered twice, so
// this module returns a neutral model and knows nothing about SVG.
//
// Shape is a three-column flow: sources -> one trunk -> sinks. That is the
// question the owner framed this around — money arrives, and then where does
// it go — rather than a general graph.
//
// No new schema. Runs entirely on Transaction / BudgetCategory / Account,
// which is what makes this cheap relative to how different it looks.

import type { Account, BudgetCategory, Transaction } from '../types/finance';

export interface CashFlowLink {
  /** Node id. */
  from: string;
  to: string;
  value: number;
}

export interface CashFlowNode {
  id: string;
  label: string;
  value: number;
  /** `source` feeds the trunk, `sink` drains it. */
  side: 'source' | 'sink';
  /** Set for category-backed nodes so the diagram can drill into them
   *  (the plan's cross-cutting requirement #3: every band clickable). */
  categoryId?: string;
  /** Distinguishes the synthetic nodes from real categories, so the UI can
   *  style "Saved" or "Left over" differently from a spending category. */
  synthetic?: 'saved' | 'debt' | 'leftover' | 'deficit' | 'uncategorised' | 'otherIncome';
}

export interface CashFlowModel {
  sources: CashFlowNode[];
  sinks: CashFlowNode[];
  links: CashFlowLink[];
  totalIn: number;
  totalOut: number;
  /** `totalIn - totalOut`. Positive is money left over, negative is a month
   *  funded from reserves. */
  net: number;
  /** True when there is nothing to draw — callers render an empty state
   *  rather than an empty axis. */
  isEmpty: boolean;
}

export const TRUNK_ID = 'trunk';

interface Options {
  transactions: Transaction[];
  categories: BudgetCategory[];
  accounts: Account[];
  /** Inclusive ISO date bounds, `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** Labels for the synthetic nodes, so this module stays i18n-free. */
  labels: {
    otherIncome: string;
    uncategorised: string;
    saved: string;
    debt: string;
    leftover: string;
    deficit: string;
  };
}

/**
 * Which transfers are real cash flow and which are internal noise.
 *
 * Moving money checking -> cash is not spending, saving, or income; it is the
 * same money in a different pocket, and counting it would inflate both sides
 * of the diagram. Moving it into savings or investment IS a destination — it
 * is the thing a budgeting tool most wants to show as an outcome. Paying down
 * a credit card is likewise a real outflow of cash.
 */
function transferSink(dest: Account | undefined): 'saved' | 'debt' | null {
  if (!dest) return null;
  if (dest.accountType === 'savings' || dest.accountType === 'investment') return 'saved';
  if (dest.accountType === 'credit_card') return 'debt';
  return null;
}

export function buildCashFlow({
  transactions,
  categories,
  accounts,
  from,
  to,
  labels,
}: Options): CashFlowModel {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const acctById = new Map(accounts.map((a) => [a.id, a]));

  // Accumulate into id -> {label, value} so repeated categories fold together.
  const sourceAcc = new Map<string, CashFlowNode>();
  const sinkAcc = new Map<string, CashFlowNode>();

  const bump = (
    acc: Map<string, CashFlowNode>,
    id: string,
    label: string,
    value: number,
    extra: Partial<CashFlowNode> = {},
  ) => {
    const existing = acc.get(id);
    if (existing) existing.value += value;
    else acc.set(id, { id, label, value, side: acc === sourceAcc ? 'source' : 'sink', ...extra });
  };

  for (const tx of transactions) {
    // Date comparison is lexicographic on `YYYY-MM-DD`, which is why the
    // bounds are ISO strings rather than Date objects — no timezone in play,
    // and a transaction dated "today" in the user's locale stays in the month
    // they filed it under.
    if (tx.date < from || tx.date > to) continue;
    // Amounts are stored positive with direction carried by `type`; a negative
    // here would be corrupt data, and letting it through would silently shrink
    // the opposite side of the diagram.
    const amount = Math.abs(tx.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;

    if (tx.type === 'income') {
      const cat = tx.categoryId ? catById.get(tx.categoryId) : undefined;
      if (cat) bump(sourceAcc, `cat:${cat.id}`, cat.name, amount, { categoryId: cat.id });
      else bump(sourceAcc, 'src:other', labels.otherIncome, amount, { synthetic: 'otherIncome' });
    } else if (tx.type === 'expense') {
      const cat = tx.categoryId ? catById.get(tx.categoryId) : undefined;
      if (cat) bump(sinkAcc, `cat:${cat.id}`, cat.name, amount, { categoryId: cat.id });
      else bump(sinkAcc, 'sink:uncat', labels.uncategorised, amount, { synthetic: 'uncategorised' });
    } else {
      const kind = transferSink(tx.destinationAccountId ? acctById.get(tx.destinationAccountId) : undefined);
      if (kind === 'saved') bump(sinkAcc, 'sink:saved', labels.saved, amount, { synthetic: 'saved' });
      else if (kind === 'debt') bump(sinkAcc, 'sink:debt', labels.debt, amount, { synthetic: 'debt' });
      // else: internal movement, deliberately dropped (see transferSink).
    }
  }

  const totalIn = [...sourceAcc.values()].reduce((s, n) => s + n.value, 0);
  const totalOut = [...sinkAcc.values()].reduce((s, n) => s + n.value, 0);
  const net = totalIn - totalOut;

  // A Sankey has to balance, and a real month rarely does. Rather than scale
  // the discrepancy away — which would misreport every band — name it:
  //   surplus  -> a "Left over" sink, the money that stayed put
  //   deficit  -> a "From reserves" source, the month funded from savings
  // Both are real events a budgeting tool should show, not rounding to hide.
  if (net > 0.005) {
    bump(sinkAcc, 'sink:leftover', labels.leftover, net, { synthetic: 'leftover' });
  } else if (net < -0.005) {
    bump(sourceAcc, 'src:deficit', labels.deficit, -net, { synthetic: 'deficit' });
  }

  // Largest first: the eye should land on the biggest band, and it keeps the
  // ribbon crossings down without a full layout solver.
  const byValue = (a: CashFlowNode, b: CashFlowNode) => b.value - a.value;
  const sources = [...sourceAcc.values()].sort(byValue);
  const sinks = [...sinkAcc.values()].sort(byValue);

  const links: CashFlowLink[] = [
    ...sources.map((n) => ({ from: n.id, to: TRUNK_ID, value: n.value })),
    ...sinks.map((n) => ({ from: TRUNK_ID, to: n.id, value: n.value })),
  ];

  return {
    sources,
    sinks,
    links,
    totalIn,
    totalOut,
    net,
    isEmpty: sources.length === 0 && sinks.length === 0,
  };
}
