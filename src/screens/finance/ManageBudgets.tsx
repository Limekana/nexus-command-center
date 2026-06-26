import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const categories = useFinanceStore((s) => s.budgetCategories);
  const addCategory = useFinanceStore((s) => s.addBudgetCategory);
  const updateCategory = useFinanceStore((s) => s.updateBudgetCategory);
  const deleteCategory = useFinanceStore((s) => s.deleteBudgetCategory);
  // v1.2 follow-up — BUG-6. List of ManualAssets the user can link a budget
  // category to. Liabilities (loan/credit) are eligible too — paying a loan
  // is an expense AND reduces the loan balance (which lives as a negative
  // contribution to net worth). So we don't filter; the picker shows all.
  const manualAssets = useFinanceStore((s) => s.manualAssets);

  const currentUserId = useSessionStore((s) => s.user?.id);

  const [editing, setEditing] = useState<BudgetCategory | null>(null);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [icon, setIcon] = useState<string>('🏠');
  const [linkedAssetId, setLinkedAssetId] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState<BudgetCategory | null>(null);

  const startAdd = () => {
    setEditing(null);
    setName('');
    setLimit('');
    setIcon('🏠');
    setLinkedAssetId('');
    setAdding(true);
  };

  const startEdit = (c: BudgetCategory) => {
    setAdding(false);
    setEditing(c);
    setName(c.name);
    setLimit(String(c.monthlyLimit));
    setIcon(c.icon ?? '🏠');
    setLinkedAssetId(c.linkedManualAssetId ?? '');
  };

  const cancel = () => {
    setEditing(null);
    setAdding(false);
    setName('');
    setLimit('');
    setLinkedAssetId('');
  };

  const save = async () => {
    const n = parseFloat(limit);
    if (!name.trim() || !n) return;
    // v1.2 follow-up — BUG-6. Pass `linkedManualAssetId: undefined` when the
    // picker is "None" so an existing link gets cleared on edit. Empty
    // string means "no selection" → undefined in the model.
    const linked = linkedAssetId || undefined;
    if (editing) {
      await updateCategory(editing.id, {
        name: name.trim(),
        monthlyLimit: n,
        icon,
        linkedManualAssetId: linked,
      });
    } else {
      await addCategory({
        name: name.trim(),
        monthlyLimit: n,
        icon,
        linkedManualAssetId: linked,
      });
    }
    cancel();
  };

  const editingNow = adding || editing != null;

  return (
    <>
      <AppHeader
        title={t('fin.budg.title')}
        back="/finance"
        backLabel={t('fin.finance')}
        showAvatar={false}
        action={
          !editingNow && (
            <button
              onClick={startAdd}
              className="text-xs px-2 py-1 rounded-sm border border-primary text-primary active:bg-primary/10"
            >
              {t('fin.budg.new')}
            </button>
          )
        }
      />
      <div className="space-y-3">
        {editingNow && (
          <div className="card space-y-2">
            <div className="font-heading font-semibold text-sm">
              {editing ? t('fin.budg.editCat') : t('fin.budg.newCat')}
            </div>
            <input
              className="input"
              placeholder={t('fin.budg.catName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <input
              className="input"
              placeholder={t('fin.budg.monthlyLimit')}
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
            <div>
              <div className="sec mb-1">{t('fin.budg.icon')}</div>
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
            {/* v1.2 follow-up — BUG-6. Linked account picker. When set, every
                transaction in this category auto-adjusts the linked asset
                (expense decrements, income increments). This wires the
                budget module to net worth so the user doesn't have to
                hand-update bank balances after every transaction. */}
            <div>
              <div className="sec mb-1">{t('fin.budg.linkedAccount')}</div>
              <select
                className="input w-full"
                value={linkedAssetId}
                onChange={(e) => setLinkedAssetId(e.target.value)}
              >
                <option value="">{t('fin.budg.none')}</option>
                {manualAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-text-muted mt-1">
                {linkedAssetId
                  ? t('fin.budg.linkedOn')
                  : t('fin.budg.linkedOff')}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={save}>
                {editing ? t('common.save') : t('common.add')}
              </button>
              <button className="btn-ghost flex-1" onClick={cancel}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="font-heading font-semibold text-sm mb-2">{t('fin.budg.categories')}</div>
          {categories.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">
              {t('fin.budg.empty')}
            </div>
          )}
          {categories.map((c) => {
            const sharedFromOther = c.ownerId && currentUserId && c.ownerId !== currentUserId;
            // v1.2 follow-up — BUG-6. Surface the link target on the row so
            // the user can see at a glance which categories propagate to net
            // worth.
            const linkedAsset = c.linkedManualAssetId
              ? manualAssets.find((a) => a.id === c.linkedManualAssetId)
              : null;
            return (
              <div key={c.id} className="flex items-center gap-2 py-2 border-b border-border/40 last:border-0">
                <span className="text-lg w-7 text-center">{c.icon ?? '•'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm flex items-center gap-1.5">
                    <span className="truncate">{c.name}</span>
                    {sharedFromOther && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary border border-primary/30 whitespace-nowrap">
                        {t('fin.budg.shared')}
                      </span>
                    )}
                    {linkedAsset && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-sm bg-success/10 text-success border border-success/30 whitespace-nowrap"
                        title={t('fin.budg.autoUpdates', { name: linkedAsset.name })}
                      >
                        → {linkedAsset.name}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-text-muted">{t('fin.budg.perMonth', { amount: c.monthlyLimit.toFixed(2) })}</div>
                </div>
                <RowActions
                  onShare={!sharedFromOther ? () => setSharing(c) : undefined}
                  onEdit={() => startEdit(c)}
                  onDelete={!sharedFromOther ? () => deleteCategory(c.id) : undefined}
                  confirmMsg={t('fin.budg.deleteConfirm', { name: c.name })}
                />
              </div>
            );
          })}
        </div>
      </div>
      {sharing && (
        <ShareModal
          title={t('fin.budg.shareTitle', { name: sharing.name })}
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
