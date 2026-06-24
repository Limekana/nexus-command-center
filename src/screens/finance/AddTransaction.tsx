import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import TemplateChips from '../../components/TemplateChips';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useTemplatesStore } from '../../store/useTemplatesStore';
import type { TransactionTemplate } from '../../types/templates';
import { TransactionType } from '../../types/finance';

const types: { key: TransactionType; label: string }[] = [
  { key: 'expense', label: '💸 Expense' },
  { key: 'income', label: '💰 Income' },
  { key: 'transfer', label: '📈 Transfer' },
];

export default function AddTransaction() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');

  const transactions = useFinanceStore((s) => s.transactions);
  const categories = useFinanceStore((s) => s.budgetCategories);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const templates = useTemplatesStore((s) => s.transactions);
  const refreshTemplates = useTemplatesStore((s) => s.refresh);
  // v1.2 follow-up — CTO Account refactor. Accounts feed the source +
  // destination pickers. We hide archived accounts from the dropdown to
  // keep it tidy, but accept them on edit (a transaction's account might
  // have been archived between creation + edit).
  const accounts = useFinanceStore((s) =>
    s.manualAssets.filter((a) => !a.archivedAt),
  );

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [destinationAccountId, setDestinationAccountId] = useState<string>('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    const tx = transactions.find((t) => t.id === editId);
    if (!tx) return;
    setType(tx.type);
    setAmount(String(tx.amount));
    setDescription(tx.description);
    setCategoryId(tx.categoryId ?? '');
    setAccountId(tx.accountId ?? '');
    setDestinationAccountId(tx.destinationAccountId ?? '');
    setDate(tx.date);
    setNotes(tx.notes ?? '');
  }, [editId, transactions]);

  // v1.2 follow-up — CTO Account refactor. Pre-fill the source account when
  // adding fresh: prefer the selected category's pre-set account (legacy
  // BUG-6 field `linkedManualAssetId` now used as `defaultAccountId`),
  // else the first available account. Only fires when no account is yet
  // chosen, so editing a transaction (which seeds from tx.accountId) is
  // never overridden.
  useEffect(() => {
    if (editId || accountId || accounts.length === 0) return;
    const cat = categoryId ? categories.find((c) => c.id === categoryId) : null;
    const defaultFromCat = cat?.linkedManualAssetId;
    if (defaultFromCat && accounts.some((a) => a.id === defaultFromCat)) {
      setAccountId(defaultFromCat);
    } else {
      setAccountId(accounts[0].id);
    }
  }, [editId, accountId, accounts, categoryId, categories]);

  // Refresh templates on mount so the chip row reflects any transactions
  // logged since the app opened (without this, chips lag by one app session).
  useEffect(() => {
    void refreshTemplates();
  }, []);

  const submit = async () => {
    const n = parseFloat(amount);
    if (!n || !description.trim()) return;
    // v1.2 follow-up — CTO Account refactor. Validation:
    //   - Transfers require source != destination (would be a no-op)
    //   - All transactions need an accountId for net-worth math to work;
    //     only allow undefined when the user has zero accounts (extreme
    //     fresh-install edge case)
    if (type === 'transfer') {
      if (!destinationAccountId) {
        alert('Pick a destination account for the transfer.');
        return;
      }
      if (destinationAccountId === accountId) {
        alert('Transfer source and destination must differ.');
        return;
      }
    }
    setSaving(true);
    const payload = {
      amount: n,
      description: description.trim(),
      categoryId: type === 'expense' ? (categoryId || undefined) : undefined,
      date,
      type,
      notes: notes.trim() || undefined,
      accountId: accountId || undefined,
      destinationAccountId:
        type === 'transfer' ? (destinationAccountId || undefined) : undefined,
    };
    if (editId) {
      await updateTransaction(editId, payload);
    } else {
      await addTransaction(payload);
    }
    setSaving(false);
    navigate('/finance');
  };

  const onDelete = async () => {
    if (!editId) return;
    if (!confirm('Delete this transaction?')) return;
    await deleteTransaction(editId);
    navigate('/finance');
  };

  // Templates are only useful when starting fresh — suppress on edit so we
  // don't surface "pre-fill" UI that would overwrite the user's existing row.
  const showTemplates = !editId && templates.length > 0;

  const applyTemplate = (t: TransactionTemplate) => {
    setType(t.type);
    setAmount(String(t.amount));
    setDescription(t.description);
    if (t.categoryId) setCategoryId(t.categoryId);
    // Date intentionally stays at today's default; recurring transactions
    // are about description+amount, not the historical date.
  };

  return (
    <>
      <AppHeader
        title={editId ? 'Edit Transaction' : 'Add Transaction'}
        back="/finance"
        backLabel="Finance"
        showAvatar={false}
      />
      <div className="space-y-3">
        {showTemplates && (
          <TemplateChips
            templates={templates}
            onPick={applyTemplate}
            label={(t) => (
              <>
                <span className="truncate max-w-[140px]">{t.description}</span>
                <span className="opacity-60">·</span>
                <span className="font-medium">
                  {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                  {t.amount.toFixed(2)}€
                </span>
              </>
            )}
          />
        )}
        <div>
          <div className="sec mb-2">Type</div>
          <div className="flex gap-2">
            {types.map((t) => (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={`chip ${type === t.key ? 'chip-on' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="sec mb-2">Amount</div>
          <div className="bg-surface border-2 border-primary/40 rounded-md p-4 flex items-center gap-2 shadow-glow">
            <span className="text-text-muted font-heading text-2xl">€</span>
            <input
              className="bg-transparent flex-1 outline-none text-text font-heading font-bold text-3xl tracking-tight"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="sec">Details</div>
          <input
            className="input"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {type === 'expense' && (
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}{c.name}
                </option>
              ))}
            </select>
          )}
          {/* v1.2 follow-up — CTO Account refactor. Account picker is
              required for every transaction; the second picker for
              transfers shows the destination. Hidden entirely when the
              user has no accounts yet (they need to set one up first;
              an inline link below points them at /finance/net-worth where
              accounts are created). */}
          {accounts.length === 0 ? (
            <div className="glass-soft rounded-md p-3 text-[11px] text-text-muted">
              No accounts yet —{' '}
              <button
                type="button"
                onClick={() => navigate('/finance/networth')}
                className="text-primary underline"
              >
                add one in Net Worth
              </button>{' '}
              so this transaction can hit a balance.
            </div>
          ) : (
            <select
              className="input"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">
                {type === 'transfer' ? 'From account…' : 'Account…'}
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          )}
          {type === 'transfer' && accounts.length >= 2 && (
            <select
              className="input"
              value={destinationAccountId}
              onChange={(e) => setDestinationAccountId(e.target.value)}
            >
              <option value="">To account…</option>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
            </select>
          )}
          <div className="flex gap-2">
            <input
              className="input max-w-[150px]"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <input
              className="input"
              placeholder="Notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <button className="btn w-full" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : editId ? 'Save Changes' : 'Save Transaction'}
        </button>
        {editId && (
          <button
            className="btn-ghost w-full text-danger border-danger/40"
            onClick={onDelete}
          >
            Delete Transaction
          </button>
        )}
        <div className="text-[10px] text-text-muted text-center">
          Queued locally · syncs when online
        </div>
      </div>
    </>
  );
}
