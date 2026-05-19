import { useState } from 'react';
import AppHeader from '../../components/AppHeader';
import RowActions from '../../components/RowActions';
import ShareModal from '../../components/ShareModal';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useSessionStore } from '../../store/useSessionStore';
import { BudgetCategory } from '../../types/finance';
import {
  listBudgetCategoryShares,
  shareBudgetCategoryByEmail,
  revokeBudgetCategoryShare,
} from '../../lib/sharing';

const ICONS = ['🏠', '🍱', '🚆', '🎬', '📚', '💪', '🛒', '☕', '✈', '💡', '💊', '🎁'];

export default function ManageBudgets() {
  const categories = useFinanceStore((s) => s.budgetCategories);
  const addCategory = useFinanceStore((s) => s.addBudgetCategory);
  const updateCategory = useFinanceStore((s) => s.updateBudgetCategory);
  const deleteCategory = useFinanceStore((s) => s.deleteBudgetCategory);

  const currentUserId = useSessionStore((s) => s.user?.id);

  const [editing, setEditing] = useState<BudgetCategory | null>(null);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [icon, setIcon] = useState<string>('🏠');
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState<BudgetCategory | null>(null);

  const startAdd = () => {
    setEditing(null);
    setName('');
    setLimit('');
    setIcon('🏠');
    setAdding(true);
  };

  const startEdit = (c: BudgetCategory) => {
    setAdding(false);
    setEditing(c);
    setName(c.name);
    setLimit(String(c.monthlyLimit));
    setIcon(c.icon ?? '🏠');
  };

  const cancel = () => {
    setEditing(null);
    setAdding(false);
    setName('');
    setLimit('');
  };

  const save = async () => {
    const n = parseFloat(limit);
    if (!name.trim() || !n) return;
    if (editing) {
      await updateCategory(editing.id, { name: name.trim(), monthlyLimit: n, icon });
    } else {
      await addCategory({ name: name.trim(), monthlyLimit: n, icon });
    }
    cancel();
  };

  const editingNow = adding || editing != null;

  return (
    <>
      <AppHeader
        title="Budget Categories"
        back="/finance"
        backLabel="Finance"
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
              {editing ? 'Edit Category' : 'New Category'}
            </div>
            <input
              className="input"
              placeholder="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <input
              className="input"
              placeholder="Monthly limit (€)"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
            <div>
              <div className="sec mb-1">Icon</div>
              <div className="flex gap-1 flex-wrap">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    onClick={() => setIcon(i)}
                    className={`w-9 h-9 rounded-md border text-lg ${
                      icon === i ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={save}>
                {editing ? 'Save' : 'Add'}
              </button>
              <button className="btn-ghost flex-1" onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="font-heading font-semibold text-sm mb-2">Categories</div>
          {categories.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">
              No categories yet — tap + New to add one
            </div>
          )}
          {categories.map((c) => {
            const sharedFromOther = c.ownerId && currentUserId && c.ownerId !== currentUserId;
            return (
              <div key={c.id} className="flex items-center gap-2 py-2 border-b border-border/40 last:border-0">
                <span className="text-lg w-7 text-center">{c.icon ?? '•'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm flex items-center gap-1.5">
                    <span className="truncate">{c.name}</span>
                    {sharedFromOther && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary border border-primary/30 whitespace-nowrap">
                        Shared
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-muted">€{c.monthlyLimit.toFixed(2)} / month</div>
                </div>
                <RowActions
                  onShare={!sharedFromOther ? () => setSharing(c) : undefined}
                  onEdit={() => startEdit(c)}
                  onDelete={!sharedFromOther ? () => deleteCategory(c.id) : undefined}
                  confirmMsg={`Delete "${c.name}"? Transactions tagged to it will be untagged.`}
                />
              </div>
            );
          })}
        </div>
      </div>
      {sharing && (
        <ShareModal
          title={`Share "${sharing.name}"`}
          subjectId={sharing.id}
          onClose={() => setSharing(null)}
          list={listBudgetCategoryShares}
          invite={shareBudgetCategoryByEmail}
          revoke={revokeBudgetCategoryShare}
        />
      )}
    </>
  );
}
