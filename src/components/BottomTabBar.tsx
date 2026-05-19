// Bottom tab navigation. We render <button> here rather than the obvious
// <NavLink> for one practical reason: NavLink renders an <a> tag, and Android
// Chromium WebView (Samsung Internet's WebView in particular) shows a native
// URL tooltip ("Home https://localhost/#/") under the user's finger on
// long-press of any <a> tag. CSS `-webkit-touch-callout: none` doesn't work
// in Chromium-based WebViews — that property is non-standard and ignored.
// Pure <button> elements never trigger the URL preview, so this is the
// reliable cross-platform fix.

import { useLocation, useNavigate } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Home', icon: '⊞', match: (p: string) => p === '/' },
  { to: '/finance', label: 'Finance', icon: '💰', match: (p: string) => p === '/finance' || p.startsWith('/finance/') },
  { to: '/studies', label: 'Studies', icon: '📚', match: (p: string) => p === '/studies' || p.startsWith('/studies/') },
  { to: '/fitness', label: 'Fitness', icon: '💪', match: (p: string) => p === '/fitness' || p.startsWith('/fitness/') },
  { to: '/tasks', label: 'Tasks', icon: '✅', match: (p: string) => p === '/tasks' || p.startsWith('/tasks/') },
];

export default function BottomTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-md border-t border-border safe-bottom z-30">
      <div className="max-w-md mx-auto flex items-stretch px-2 pt-2 pb-2">
        {tabs.map((t) => {
          const isActive = t.match(pathname);
          return (
            <button
              key={t.to}
              type="button"
              onClick={() => navigate(t.to)}
              aria-label={t.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-md transition-colors ${
                isActive ? 'text-primary' : 'text-text-muted'
              }`}
            >
              <span
                className={`w-9 h-9 rounded-md border flex items-center justify-center text-base ${
                  isActive
                    ? 'border-primary/60 bg-primary/10 shadow-glow'
                    : 'border-border bg-surface'
                }`}
              >
                {t.icon}
              </span>
              <span className="text-[10px] font-medium tracking-wide">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
