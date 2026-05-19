import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore, userInitials } from '../store/useSessionStore';

interface AppHeaderProps {
  title: string;
  back?: string;
  backLabel?: string;
  action?: ReactNode;
  showAvatar?: boolean;
}

export default function AppHeader({ title, back, backLabel, action, showAvatar = true }: AppHeaderProps) {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const initials = userInitials(user);

  return (
    <header className="flex items-center justify-between py-3 mb-3">
      <div className="flex items-center gap-3 min-w-0">
        {back && (
          <button
            onClick={() => navigate(back)}
            className="text-text-muted text-xs flex items-center gap-1 active:text-primary"
          >
            ← {backLabel ?? 'Back'}
          </button>
        )}
        <h1 className="font-heading font-bold text-xl tracking-tight truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {action}
        {showAvatar && (
          <button
            onClick={() => navigate('/settings')}
            className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-[10px] font-heading font-semibold text-primary"
            aria-label="Account"
          >
            {initials}
          </button>
        )}
      </div>
    </header>
  );
}
