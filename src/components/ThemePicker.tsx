// v1.15 (Item 13) — Settings › Appearance. The free instrument theme and the
// Rack supporter theme, picked by looking rather than by reading.
//
// LimeLog's ThemeCard shape on purpose (and the lesson of StudyDesk Item 14):
// a flat grid of swatch + name, and exactly one sentence below it, shown only
// while it is true — a non-supporter learns once why Rack is locked, instead
// of every option carrying its own line.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { isEntitled, ENTITLEMENT_EVENT } from '../lib/entitlement';
import {
  THEMES,
  isPaidTheme,
  preferredTheme,
  setPreferredTheme,
  useActiveTheme,
  type ThemeId,
} from '../lib/theme';

// Literal values, not tokens: a preview that followed the theme currently
// applied would show what you already have rather than what you would get.
// Four stops each — ground, panel, ink, signal.
const PREVIEW: Record<ThemeId, [string, string, string, string]> = {
  instrument: ['#0B0C0E', '#141618', '#E8E6E1', '#E8A33D'],
  rack: ['#1C1D1F', '#2A2C2F', '#E4DCC4', '#E4553A'],
};

export default function ThemePicker() {
  const { t } = useTranslation();
  const active = useActiveTheme();
  const [entitled, setEntitled] = useState(() => isEntitled());
  // Highlight the PREFERENCE: a lapsed supporter who chose Rack sees Rack
  // selected-but-locked, which is exactly what renewing gives back.
  const [chosen, setChosen] = useState<ThemeId>(() => preferredTheme());

  useEffect(() => {
    const reread = () => setEntitled(isEntitled());
    window.addEventListener(ENTITLEMENT_EVENT, reread);
    return () => window.removeEventListener(ENTITLEMENT_EVENT, reread);
  }, []);

  return (
    <div className="py-2">
      <div className="grid grid-cols-3 gap-2 max-w-[360px]">
        {THEMES.map((id) => {
          const locked = isPaidTheme(id) && !entitled;
          const on = chosen === id && (active === id || locked);
          const name = t(`settings.themeName.${id}`);
          return (
            <button
              key={id}
              type="button"
              disabled={locked}
              aria-pressed={on}
              aria-label={locked ? t('settings.themeLockedAria', { name }) : undefined}
              onClick={() => {
                setPreferredTheme(id);
                setChosen(id);
              }}
              className={`panel-2 p-1.5 flex flex-col gap-1.5 text-start transition-colors disabled:cursor-default ${
                on ? 'border-text' : 'hover:border-text-faint'
              } ${locked ? 'opacity-70' : ''}`}
            >
              <span className="flex h-6 overflow-hidden border border-border" aria-hidden="true">
                {PREVIEW[id].map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </span>
              <span className="flex items-center justify-between gap-1 text-xs font-medium">
                {name}
                {locked && <Lock size={11} strokeWidth={2} className="text-text-faint flex-shrink-0" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>
      {!entitled && (
        <div className="text-[0.625rem] text-text-muted mt-2">{t('settings.themeSupporterNote')}</div>
      )}
    </div>
  );
}
