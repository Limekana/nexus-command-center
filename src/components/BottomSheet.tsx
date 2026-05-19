import { ReactNode, useEffect } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 bg-surface border-t-2 border-primary/40 rounded-t-2xl z-50 transition-transform safe-bottom max-w-md mx-auto ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="font-heading font-bold text-base">{title}</div>
          <button onClick={onClose} className="text-text-muted text-xl active:text-primary">
            ×
          </button>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </>
  );
}
