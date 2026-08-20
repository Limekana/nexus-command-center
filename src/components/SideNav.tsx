// v1.9 Item 14, Phase 1 — the desktop/tablet side navigation.
//
// Replaces BottomTabBar above 769px. A thumb-reach pill pinned to the bottom
// of a 1920px window is furniture in the wrong place: on a pointer device the
// nav belongs at the edge the eye starts from, and it can afford to be
// persistent rather than floating.
//
// Sections come from BottomTabBar's exported `tabs` — same list, same order,
// same route matching, so the two navs cannot drift.
//
// Design is NCC's own idiom rather than a copy of StudyDesk's paper sidebar:
// panel, cyan accent, and an active treatment that reads as the
// sidebar analogue of the bottom bar's sliding pill — a cyan edge rail plus a
// soft panel field, instead of a pill that slides between four fixed slots.

import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { tabs } from './BottomTabBar';

const WIDTH_FULL = 240;
const WIDTH_RAIL = 64;

interface SideNavProps {
  rail: boolean;
  onToggle: () => void;
}

export default function SideNav({ rail, onToggle }: SideNavProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const toggleLabel = rail ? t('nav.expandSidebar') : t('nav.collapseSidebar');

  return (
    <aside
      // `h-screen self-start` rather than letting the flex row stretch it: the
      // main column scrolls internally, so the shell itself never scrolls and
      // the rail should simply be viewport-tall.
      className="relative z-30 flex h-screen shrink-0 self-start flex-col panel border-e border-border transition-[width] duration-200 ease-spring-soft motion-reduce:transition-none"
      style={{ width: rail ? WIDTH_RAIL : WIDTH_FULL }}
      aria-label={t('nav.home')}
    >
      {/* Wordmark. No logo asset ships with NCC, and the Cyber Slate identity
          is typographic anyway — a cyan monogram plus Space Grotesk does the
          work, and the monogram alone survives the rail. */}
      <div
        className={`safe-top flex items-center border-b border-border pb-4 pt-5 ${
          rail ? 'justify-center px-0' : 'gap-3 px-4'
        }`}
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface2 border border-border font-mono text-sm font-medium text-text"
        >
          N
        </span>
        {!rail && (
          <div className="min-w-0">
            <div className="truncate font-heading text-base font-bold leading-none tracking-tight">Nexus</div>
            <div className="mt-1 text-[0.625rem] uppercase tracking-[0.14em] text-text-muted">Command Center</div>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {tabs.map(({ Icon, ...tab }) => {
          const isActive = tab.match(pathname);
          const label = t(tab.labelKey);
          return (
            <button
              key={tab.to}
              type="button"
              onClick={() => navigate(tab.to)}
              // The label is not rendered in the rail, so it has to survive as
              // the accessible name; the tooltip is only added there, since a
              // tooltip repeating a visible label is noise.
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              title={rail ? label : undefined}
              className={`press-spring relative flex items-center rounded-md py-2.5 transition-colors duration-200 ease-spring-soft ${
                rail ? 'justify-center px-0' : 'gap-3 px-3'
              } ${isActive ? 'panel-2 text-text' : 'text-text-muted hover:text-text'}`}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-y-1 start-0 w-0.5 bg-primary"
                />
              )}
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {!rail && <span className="truncate text-sm font-medium">{label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!rail}
          aria-label={toggleLabel}
          title={toggleLabel}
          className={`press-spring flex w-full items-center rounded-md py-2.5 text-text-muted transition-colors duration-200 hover:text-text ${
            rail ? 'justify-center px-0' : 'gap-3 px-3'
          }`}
        >
          {rail ? (
            <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
          {!rail && (
            <span className="text-[0.6875rem] uppercase tracking-[0.12em]">{t('nav.collapseSidebar')}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
