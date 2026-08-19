// Bottom tab navigation. We render <button> here rather than the obvious
// <NavLink> for one practical reason: NavLink renders an <a> tag, and Android
// Chromium WebView (Samsung Internet's WebView in particular) shows a native
// URL tooltip ("Home https://localhost/#/") under the user's finger on
// long-press of any <a> tag. CSS `-webkit-touch-callout: none` doesn't work
// in Chromium-based WebViews — that property is non-standard and ignored.
// Pure <button> elements never trigger the URL preview, so this is the
// reliable cross-platform fix.
//
// v1.10 — a flat panel with a 2px amber index mark on the top edge of the
// active tab, in place of the glowing cyan pill that used to slide behind it.
// The mark is the same device the tick strips use: a position on a scale. It
// still slides, because the movement is what tells you which way you went.
//
// Design notes:
//   - The active pill is a positioned, animated background layer that slides
//     to the selected tab. CSS-only — the `<span data-active-pill>` is
//     absolutely positioned over the tab grid and transitions its
//     transform/width via the spring-soft timing. No JS measurement; we
//     compute the pill's flex offset from the active tab index.
//   - Icons grow ~10% on the active tab for tactile feedback. Combined with
//     the cyan accent + pill backdrop, the selected state is unmistakable
//     without lighting up the whole bar.
//   - Tab labels stay 11px (UI/UX review v1.1 #4 settled this).
//
// v1.9 (Item 6) — the four emoji glyphs are gone. Two were
// geometric symbols and two were full-colour emoji, so the row mixed a
// monochrome accent with vendor artwork that renders differently on every
// device and ignores the cyan accent entirely. Replaced with lucide line
// icons at the same size and stroke weight LimeLog uses, which is the
// treatment the suite is converging on.

import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Wallet, Activity, ListChecks, type LucideIcon } from 'lucide-react';

interface Tab {
  to: string;
  labelKey: string;
  Icon: LucideIcon;
  match: (p: string) => boolean;
}

// Exported (v1.9 Item 14) so `SideNav` renders the same sections rather than
// keeping a second copy of this list — two navigation components that can
// drift apart is exactly the bug the desktop shell would otherwise introduce.
// eslint-disable-next-line react-refresh/only-export-components -- deliberate cross-component data export, see above
export const tabs: Tab[] = [
  { to: '/', labelKey: 'nav.home', Icon: LayoutGrid, match: (p) => p === '/' },
  { to: '/finance', labelKey: 'nav.finance', Icon: Wallet, match: (p) => p === '/finance' || p.startsWith('/finance/') },
  // v1.3 scope reduction — Studies + Fitness tabs removed (their dedicated
  // screens were retired). Life is promoted to a primary tab; it surfaces
  // the cross-domain life score those domains now feed as signals.
  //
  // Activity (the pulse line) rather than a heart: Life is a composite score
  // across four domains, not a health metric.
  { to: '/life', labelKey: 'nav.life', Icon: Activity, match: (p) => p === '/life' },
  { to: '/tasks', labelKey: 'nav.tasks', Icon: ListChecks, match: (p) => p === '/tasks' || p.startsWith('/tasks/') },
];

export default function BottomTabBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeIdx = tabs.findIndex((tab) => tab.match(pathname));

  return (
    <nav className="fixed bottom-0 left-0 right-0 safe-bottom z-30 px-3 pb-2 pt-2 pointer-events-none">
      {/* v1.2 follow-up — pointer-events-auto used to live on the
          `max-w-md` wrapper, but that's typically wider than a phone, so
          the entire bottom strip swallowed touches. Even with pb-44 on
          main, the 16px vertical gutters above/below the pill were
          intercepting touch attempts. Move pointer-events-auto down to
          the panel itself so only the panel blocks touch — gutters now
          pass through to whatever's behind. */}
      <div className="max-w-md mx-auto">
        <div className="panel px-1.5 py-1.5 relative pointer-events-auto overflow-hidden">
          {/* Sliding index mark — absolutely positioned on the panel's top
              edge, transitions its translate to follow the active tab index.
              Width is computed via CSS calc on the flex parent's effective
              tab width. */}
          {activeIdx >= 0 && (
            <span
              data-active-pill
              aria-hidden
              className="absolute top-0 h-[2px] start-1.5 pointer-events-none transition-transform duration-300 ease-spring-soft"
              style={{
                // 4 tabs evenly fill the inner space (width minus left+right
                // 1.5 padding on the panel). Each tab occupies 1/4 of that,
                // so translateX = activeIdx * 100%.
                width: 'calc((100% - 0.75rem) / 4)',
                transform: `translateX(calc(${activeIdx} * 100%))`,
                background: 'var(--signal)',
              }}
            />
          )}
          <div className="relative flex items-stretch">
            {tabs.map(({ Icon, ...tab }) => {
              const isActive = tab.match(pathname);
              return (
                <button
                  key={tab.to}
                  type="button"
                  onClick={() => navigate(tab.to)}
                  aria-label={t(tab.labelKey)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative z-10 transition-colors duration-200 ${
                    isActive ? 'text-primary' : 'text-text-muted'
                  }`}
                >
                  {/* No scale-up on the active icon. The index mark above
                      already says which tab is current, and a springing icon
                      said it a second time in a softer vocabulary. */}
                  <span className="leading-none">
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] leading-tight">{t(tab.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
