import { useTranslation } from 'react-i18next';
import { useConfirm } from './ConfirmDialog';
interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  confirmMsg?: string;
}

export default function RowActions({ onEdit, onDelete, onShare, confirmMsg }: RowActionsProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {onShare && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          className="text-text-muted hover:text-primary active:text-primary text-xs px-2 py-1 rounded-sm border border-border active:bg-surface2"
          aria-label="Share"
        >
          ⇆
        </button>
      )}
      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="text-text-muted hover:text-primary active:text-primary text-xs px-2 py-1 rounded-sm border border-border active:bg-surface2"
          aria-label="Edit"
        >
          ✎
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void (async () => {
              // confirmMsg is optional; callers that pass nothing get the
              // generic translated prompt rather than the old English default.
              if (await confirm({ message: confirmMsg ?? t('common.deleteItem') })) onDelete();
            })();
          }}
          className="text-text-muted hover:text-danger active:text-danger text-xs px-2 py-1 rounded-sm border border-border active:bg-danger/10"
          aria-label="Delete"
        >
          ✕
        </button>
      )}
    </div>
  );
}
