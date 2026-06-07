import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import { useFinanceStore } from '../../store/useFinanceStore';
import { validateTicker } from '../../lib/tickerValidation';
import type { PortfolioHolding, AssetType } from '../../types/finance';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'JPY'];

// Add flow asks for the FIRST purchase inline so a single tap creates both
// the holding and its initial lot. Editing an existing holding never touches
// lots — that's what the Purchases sub-screen is for. This split is important:
// editing the ticker shouldn't accidentally erase your purchase history.
export default function ManageHoldings() {
  const navigate = useNavigate();
  const holdings = useFinanceStore((s) => s.holdings);
  const portfolioLots = useFinanceStore((s) => s.portfolioLots);
  const addHolding = useFinanceStore((s) => s.addHolding);
  const updateHolding = useFinanceStore((s) => s.updateHolding);
  const deleteHolding = useFinanceStore((s) => s.deleteHolding);
  const addLot = useFinanceStore((s) => s.addLot);
  const refreshPortfolio = useFinanceStore((s) => s.refreshPortfolio);

  const [editing, setEditing] = useState<PortfolioHolding | null>(null);
  const [adding, setAdding] = useState(false);
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  // v1.2.1 — security audit finding M: ticker entry-point allowlist.
  // Surfaces validation errors inline so the user understands why save
  // looks armed but does nothing.
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [sectorOverride, setSectorOverride] = useState('');

  // First-purchase fields (Add flow only).
  const [firstQty, setFirstQty] = useState('');
  const [firstPrice, setFirstPrice] = useState('');
  const [firstCurrency, setFirstCurrency] = useState('EUR');
  const [firstDate, setFirstDate] = useState(() => new Date().toISOString().slice(0, 10));

  const lotsByHolding = (id: string) => portfolioLots.filter((l) => l.holdingId === id);

  const startAdd = () => {
    setEditing(null);
    setAdding(true);
    setTicker('');
    setName('');
    setAssetType('stock');
    setSectorOverride('');
    setFirstQty('');
    setFirstPrice('');
    setFirstCurrency('EUR');
    setFirstDate(new Date().toISOString().slice(0, 10));
  };

  const startEdit = (h: PortfolioHolding) => {
    setAdding(false);
    setEditing(h);
    setTicker(h.ticker);
    setName(h.name);
    setAssetType(h.assetType);
    setSectorOverride(h.sectorOverride ?? '');
  };

  const cancel = () => {
    setEditing(null);
    setAdding(false);
  };

  const save = async () => {
    if (!name.trim()) return;
    // v1.2.1 — security audit finding M. Validate before any store write
    // so a hostile / typo'd identifier never makes it into Dexie, the
    // outbox, or any URL we build downstream.
    const v = validateTicker(ticker);
    if (!v.ok) {
      setTickerError(v.error);
      return;
    }
    setTickerError(null);
    const normalisedTicker = assetType === 'crypto'
      ? v.normalised.toLowerCase()
      : v.normalised.toUpperCase();
    if (editing) {
      // Edit flow — basic details only. Quantity + cost are derived from lots
      // and aren't editable here.
      await updateHolding(editing.id, {
        ticker: normalisedTicker,
        name: name.trim(),
        assetType,
        sectorOverride: sectorOverride.trim() || undefined,
      });
    } else {
      // Add flow — must have at least quantity + price for the first lot
      // (otherwise creating an empty holding with no purchase history is
      // worse than telling the user up-front).
      const qty = parseFloat(firstQty);
      const price = parseFloat(firstPrice);
      if (!qty || qty <= 0 || isNaN(price) || price < 0) return;
      const holdingId = await addHolding({
        ticker: normalisedTicker,
        name: name.trim(),
        assetType,
        quantity: qty, // initial value; lot creation will overwrite via recompute
        sectorOverride: sectorOverride.trim() || undefined,
      });
      await addLot({
        holdingId,
        quantity: qty,
        costPerUnit: price,
        costCurrency: firstCurrency,
        purchaseDate: firstDate || undefined,
      });
    }
    await refreshPortfolio();
    cancel();
  };

  const onDelete = async (id: string) => {
    await deleteHolding(id);
    await refreshPortfolio();
  };

  const editingNow = adding || editing != null;

  // Asset-class metadata for UI labels.
  const ASSET_LABELS: Record<AssetType, string> = {
    stock: '📈 Stock',
    etf: '🧺 ETF',
    crypto: '₿ Crypto',
  };

  return (
    <>
      <AppHeader
        title="Manage Holdings"
        back="/finance/portfolio"
        backLabel="Portfolio"
        showAvatar={false}
        action={
          !editingNow && (
            <button
              onClick={startAdd}
              className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
            >
              + New
            </button>
          )
        }
      />
      <div className="space-y-3">
        {editingNow && (
          <div className="card space-y-2">
            <div className="font-heading font-semibold text-sm">
              {editing ? 'Edit Holding' : 'New Holding'}
            </div>
            <div className="flex gap-2">
              {(['stock', 'etf', 'crypto'] as AssetType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setAssetType(t)}
                  className={`chip flex-1 ${assetType === t ? 'chip-on' : ''}`}
                  type="button"
                >
                  {ASSET_LABELS[t]}
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder={
                assetType === 'crypto'
                  ? 'CoinGecko id (e.g. bitcoin)'
                  : assetType === 'etf'
                    ? 'Ticker (e.g. CNDX.L)'
                    : 'Ticker (e.g. AAPL)'
              }
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value);
                if (tickerError) setTickerError(null);
              }}
              autoFocus
            />
            {tickerError && (
              <div className="text-[11px] text-warning">{tickerError}</div>
            )}
            <input
              className="input"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Sector (optional, e.g. Technology, Banking)"
              value={sectorOverride}
              onChange={(e) => setSectorOverride(e.target.value)}
            />
            {!editing && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">
                  First Purchase
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Quantity"
                    inputMode="decimal"
                    value={firstQty}
                    onChange={(e) => setFirstQty(e.target.value)}
                  />
                  <input
                    className="input flex-1"
                    placeholder="Price per unit"
                    inputMode="decimal"
                    value={firstPrice}
                    onChange={(e) => setFirstPrice(e.target.value)}
                  />
                  <select
                    className="input max-w-[88px]"
                    value={firstCurrency}
                    onChange={(e) => setFirstCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <input
                  className="input"
                  type="date"
                  value={firstDate}
                  onChange={(e) => setFirstDate(e.target.value)}
                />
              </>
            )}
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={save}>
                {editing ? 'Save' : 'Add'}
              </button>
              <button className="btn-ghost flex-1" onClick={cancel}>
                Cancel
              </button>
            </div>
            <div className="text-[10px] text-text-muted">
              {assetType === 'stock'
                ? 'Quotes via Finnhub. Use the exchange ticker.'
                : assetType === 'etf'
                  ? 'ETFs use stock quotes — same ticker rules. International suffixes (.L, .DE) route to Yahoo.'
                  : 'Prices via CoinGecko. Use the lowercase coin id (bitcoin, ethereum, solana…).'}
              {' Add additional purchases later from the Purchases button.'}
            </div>
          </div>
        )}

        <div className="card">
          <div className="font-heading font-semibold text-sm mb-2">Holdings</div>
          {holdings.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">
              No holdings yet — tap + New to add one
            </div>
          )}
          {holdings.map((h) => {
            const lotCount = lotsByHolding(h.id).length;
            return (
              <div key={h.id} className="flex items-center gap-2 py-2 border-b border-border/40 last:border-0">
                <span className="text-[9px] uppercase text-text-muted w-10 flex-shrink-0">
                  {h.assetType === 'stock' ? 'STOCK' : h.assetType === 'etf' ? 'ETF' : 'CRYPTO'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-heading font-semibold truncate">{h.ticker.toUpperCase()}</div>
                  <div className="text-[10px] text-text-muted truncate">
                    {h.name} · {h.quantity}
                    {h.sectorOverride && <> · {h.sectorOverride}</>}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/finance/portfolio/lots/${h.id}`)}
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-border text-text-muted active:border-primary active:text-primary flex-shrink-0"
                >
                  📦 {lotCount}
                </button>
                <RowActions
                  onEdit={() => startEdit(h)}
                  onDelete={() => onDelete(h.id)}
                  confirmMsg={`Remove ${h.ticker.toUpperCase()} from portfolio? Purchase history will also be deleted.`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
