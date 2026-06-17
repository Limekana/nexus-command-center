// Bottom tab navigation. We render <button> here rather than the obvious
// <NavLink> for one practical reason: NavLink renders an <a> tag, and Android
// Chromium WebView (Samsung Internet's WebView in particular) shows a native
// URL tooltip ("Home https://localhost/#/") under the user's finger on
// long-press of any <a> tag. CSS `-webkit-touch-callout: none` doesn't work
// in Chromium-based WebViews — that property is non-standard and ignored.
// Pure <button> elements never trigger the URL preview, so this is the
// reliable cross-platform fix.
//
// v1.2 visual upgrade — promoted from a flat bg-surface bar to a glass-strong
// nav with a pill-shaped active indicator that springs into place.
//
// Design notes:
//   - The active pill is a positioned, animated background layer that slides
//     to the selected tab. CSS-only — the `<span data-active-pill>` is
//     absolutely positioned over the tab grid and transitions its
//     transform/width via the spring-soft timing. No JS measurement; we
//     compute the pill's flex offset from the active tab index.
//   - Icon glyphs grow ~10% on the active tab via .scale-110 for tactile
//     feedback. Combined with the cyan accent + pill backdrop, the selected
//     state is unmistakable without lighting up the whole bar.
//   - Tab labels stay 11px (UI/UX review v1.1 #4 settled this).

import { useLocation, useNavigate } from 'react-router-dom';

interface Tab {
  to: string;
  label: string;
  icon: string;
  match: (p: string) => boolean;
}

const tabs: Tab[] = [
  { to: '/', label: 'Home', icon: '⊞', match: (p) => p === '/' },
  { to: '/finance', label: 'Finance', icon: '💰', match: (p) => p === '/finance' || p.startsWith('/finance/') },
  // v1.3 scope reduction — Studies + Fitness tabs removed (their dedicated
  // screens were retired). Life is promoted to a primary tab; it surfaces
  // the cross-domain life score those domains now feed as signals.
  { to: '/life', label: 'Life', icon: '◎', match: (p) => p === '/life' },
  { to: '/tasks', label: 'Tasks', icon: '✅', match: (p) => p === '/tasks' || p.startsWith('/tasks/') },
];

export default function BottomTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeIdx = tabs.findIndex((t) => t.match(pathname));

  return (
    <nav className="fixed bottom-0 left-0 right-0 safe-bottom z-30 px-3 pb-2 pt-2 pointer-events-none">
      {/* v1.2 follow-up — pointer-events-auto used to live on the
          `max-w-md` wrapper, but that's typically wider than a phone, so
          the entire bottom strip swallowed touches. Even with pb-44 on
          main, the 16px vertical gutters above/below the pill were
          intercepting touch attempts. Move pointer-events-auto down to
          the actual `.glass-strong` pill so only the pill itself blocks
          touch — gutters now pass through to whatever's behind. */}
      <div className="max-w-md mx-auto">
        <div className="glass-strong rounded-pill px-1.5 py-1.5 relative pointer-events-auto">
          {/* Sliding active pill — absolutely positioned, transitions its
              translate to follow the active tab index. Width is computed via
              CSS calc on the flex parent's effective tab width. */}
          {activeIdx >= 0 && (
            <span
              data-active-pill
              aria-hidden
              className="absolute top-1.5 bottom-1.5 left-1.5 rounded-pill pointer-events-none transition-transform duration-300 ease-spring-soft"
              style={{
                // 4 tabs evenly fill the inner space (width minus left+right
                // 1.5 padding on the .glass-strong). Each tab occupies 1/4 of
                // that, so translateX = activeIdx * 100%.
                width: 'calc((100% - 0.75rem) / 4)',
                transform: `translateX(calc(${activeIdx} * 100%))`,
                background: 'rgba(0, 212, 255, 0.14)',
                boxShadow: '0 0 0 1px rgba(0, 212, 255, 0.55), 0 0 18px -6px rgba(0, 212, 255, 0.5)',
              }}
            />
          )}
          <div className="relative flex items-stretch">
            {tabs.map((t) => {
              const isActive = t.match(pathname);
              return (
                <button
                  key={t.to}
                  type="button"
                  onClick={() => navigate(t.to)}
                  aria-label={t.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-pill relative z-10 transition-colors duration-200 ease-spring-soft active:scale-[0.94] ${
                    isActive ? 'text-primary' : 'text-text-muted'
                  }`}
                >
                  <span
                    className={`text-lg leading-none transition-transform duration-300 ease-spring ${
                      isActive ? 'scale-110' : 'scale-100'
                    }`}
                  >
                    {t.icon}
                  </span>
                  <span className="text-[11px] font-medium tracking-wide leading-tight">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
