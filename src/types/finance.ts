export type TransactionType = 'expense' | 'income' | 'transfer';
export type SyncStatus = 'pending' | 'synced';

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  categoryId?: string;
  date: string;
  type: TransactionType;
  notes?: string;
  syncStatus: SyncStatus;
  createdAt: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  monthlyLimit: number;
  icon?: string;
  createdAt: string;
  // Populated by cloud pull. When set and != current user's id, this row is
  // shared *to* us by another user — the Sharing UI uses this to render a
  // "Shared by …" tag and gate destructive actions.
  ownerId?: string;
}

export type AssetType = 'stock' | 'crypto' | 'etf';

export interface PortfolioHolding {
  id: string;
  ticker: string;
  name: string;
  assetType: AssetType;
  // Quantity and avgCostNative are CACHED aggregates derived from lots
  // (sum of qty; weighted avg of cost). When a holding has zero lots the
  // user-entered quantity remains in place as a fallback and P/L is hidden.
  quantity: number;
  createdAt: string;
  currentPrice?: number;
  priceChange?: number;
  cacheAge?: number;
  // Cost basis — weighted average purchase price per unit and the currency
  // the user paid in. Re-computed from lots whenever they change; nullable
  // before any lot exists. Currency may differ from quote currency (bought
  // GOOG in EUR through a euro broker → quote USD, cost EUR); FX conversion
  // happens at render time.
  avgCostNative?: number;
  costCurrency?: string;
  // Manual sector — overrides what we'd auto-derive from Finnhub's
  // /stock/profile2 (which is blank for ETFs and most international tickers).
  // When set, the allocation donut's Sector view uses this verbatim.
  sectorOverride?: string;
}

// One purchase. Multiple lots → same holding stack so the user can record
// real buying patterns instead of having to maintain a synthetic avg cost.
// Sales aren't modeled yet (deferred); when added they'd live in this table
// as `quantity < 0` lots or in a sibling sales table.
export interface PortfolioLot {
  id: string;
  holdingId: string;
  quantity: number;
  costPerUnit: number;
  costCurrency: string;
  // ISO date (YYYY-MM-DD) — date only, time-of-day not meaningful for purchase
  // record-keeping. Optional so legacy synthesized lots from pre-lots data
  // can be stamped without inventing a date the user didn't provide.
  purchaseDate?: string;
  notes?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt?: string;
}

// Manually tracked asset or liability outside the portfolio (cash savings,
// property, vehicles, loans, credit card debt). Used to compute net worth.
// asset_type 'loan' and 'credit' are liabilities — net worth subtracts them.
export type ManualAssetType = 'cash' | 'savings' | 'property' | 'vehicle' | 'other' | 'loan' | 'credit';
export const LIABILITY_TYPES: ManualAssetType[] = ['loan', 'credit'];

export interface ManualAsset {
  id: string;
  name: string;
  assetType: ManualAssetType;
  value: number;
  currency: string;
  notes?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt?: string;
}

// Tickers tracked without owning. Reuses the same Finnhub+Yahoo quote
// pipeline as portfolio_holdings; the quote results live in stockQuotes
// like any other equity. We just exclude them from P/L and allocation math.
export interface WatchlistItem {
  id: string;
  ticker: string;
  name: string;
  assetType: 'stock' | 'crypto' | 'etf';
  notes?: string;
  targetAbove?: number;
  targetBelow?: number;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt?: string;
}

// One sampled snapshot of total portfolio value (in base currency). Written
// at most once per local day after a successful refresh. Local-only — we don't
// sync these since they're derivable from holdings + quotes, and re-running
// refresh on the other device will recreate them.
export interface PortfolioSnapshot {
  date: string; // YYYY-MM-DD (local time)
  valueBase: number;
  baseCurrency: string;
  createdAt: string;
}

export interface ApiCacheEntry {
  cacheKey: string;
  data: string;
  fetchedAt: string;
  expiresAt: string;
}
