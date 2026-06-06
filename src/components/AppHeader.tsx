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

/**
 * v1.2 AppHeader — title text floats over the mesh (no card frame, keeps
 * visual lightness). Avatar is now a glass-soft pill with a cyan-tinted
 * initial. Back-button is a pill-shaped hit zone for thumb reach.
 */
export default function AppHeader({ title, back, backLabel, action, showAvatar = true }: AppHeaderProps) {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const initials = userInitials(user);

  return (
    // v1.2 follow-up — title side gets `flex-1 min-w-0` so it CAN shrink
    // for ellipsis but doesn't get clobbered down to a single letter when
    // the action area is wide (the Finance overview, with 5 action chips,
    // was the offender). Action area is `flex-shrink-0` so it takes only
    // its natural width and stops claiming title space.
    <header className="flex items-center justify-between py-3 mb-3 gap-2">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {back && (
          <button
            onClick={() => navigate(back)}
            className="glass-soft rounded-pill text-text-muted text-xs flex items-center gap-1 px-3 h-8 active:text-primary press-spring flex-shrink-0"
            aria-label={backLabel ?? 'Back'}
          >
            <span aria-hidden>←</span> {backLabel ?? 'Back'}
          </button>
        )}
        <h1 className="font-heading font-bold text-xl tracking-tight truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {action}
        {showAvatar && (
          <button
            onClick={() => navigate('/settings')}
            className="w-9 h-9 rounded-full glass-soft flex items-center justify-center text-[10px] font-heading font-semibold text-primary press-spring flex-shrink-0"
            aria-label="Account"
          >
            {initials}
          </button>
        )}
      </div>
    </header>
  );
}
