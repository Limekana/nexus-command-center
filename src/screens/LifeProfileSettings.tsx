// ─── v1.5 Life Profile settings screen ──────────────────────────────────
//
// Dedicated screen (reached from Settings → Life Profile) for choosing which
// life domains feed the Life Score and how they're weighted.
//
//   - Student / Professional presets apply immediately (equal-weighted mixes).
//   - Custom reveals a per-domain editor: a checkbox to include/exclude each
//     domain and a slider for its weight. Adjusting any slider auto-rebalances
//     the other enabled domains so the total always lands on 100% — so there's
//     no invalid state to "save"; changes persist (debounced) automatically.
//
// Cyber Slate Glass — pill selector, glass rows, cyan accents.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppHeader from '../components/AppHeader';
import { useLifeProfileStore } from '../store/useLifeProfileStore';
import {
  DOMAIN_KEYS,
  MIN_DOMAIN_WEIGHT,
  MIN_ENABLED_DOMAINS,
  type DomainKey,
  type LifeProfile,
  type LifeProfilePreset,
  enabledDomains,
  presetProfile,
  withDomainEnabled,
  withWeight,
} from '../lib/lifeProfile';

const PRESETS: { key: LifeProfilePreset; labelKey: string }[] = [
  { key: 'student', labelKey: 'lifeProfile.student' },
  { key: 'professional', labelKey: 'lifeProfile.professional' },
  { key: 'custom', labelKey: 'lifeProfile.custom' },
];

const DOMAIN_NOTE_KEY: Record<DomainKey, string> = {
  finance: 'lifeProfile.noteFinance',
  fitness: 'lifeProfile.noteFitness',
  studies: 'lifeProfile.noteStudies',
  work: 'lifeProfile.noteWork',
  habits: 'lifeProfile.noteHabits',
};

export default function LifeProfileSettings() {
  const { t } = useTranslation();
  const profile = useLifeProfileStore((s) => s.profile);
  const setProfile = useLifeProfileStore((s) => s.setProfile);
  const resetToPreset = useLifeProfileStore((s) => s.resetToPreset);

  // Local working copy so slider drags feel instant; persistence is debounced.
  const [draft, setDraft] = useState<LifeProfile>(profile);
  const lastPersisted = useRef<string>(JSON.stringify(profile));

  // Pull external updates (cloud load) into the draft when they differ and the
  // user isn't mid-edit on a custom profile.
  useEffect(() => {
    const incoming = JSON.stringify(profile);
    if (incoming !== JSON.stringify(draft) && incoming !== lastPersisted.current) {
      setDraft(profile);
      lastPersisted.current = incoming;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Debounced persistence of custom edits.
  useEffect(() => {
    const serialized = JSON.stringify(draft);
    if (serialized === lastPersisted.current) return;
    const t = setTimeout(() => {
      void setProfile(draft);
      lastPersisted.current = serialized;
    }, 400);
    return () => clearTimeout(t);
  }, [draft, setProfile]);

  const isCustom = draft.preset === 'custom';
  const enabled = enabledDomains(draft);

  const onPreset = (preset: LifeProfilePreset) => {
    if (preset === 'custom') {
      // Seed a custom profile from the current weights (mark preset custom).
      setDraft({ preset: 'custom', domains: { ...draft.domains } });
      return;
    }
    const next = presetProfile(preset);
    setDraft(next);
    lastPersisted.current = JSON.stringify(next);
    void resetToPreset(preset);
  };

  return (
    <>
      <AppHeader title={t('lifeProfile.title')} back="/settings" backLabel={t('settings.title')} showAvatar={false} />
      <div className="space-y-4">
        <p className="text-xs text-text-muted px-1 leading-relaxed">
          {t('lifeProfile.blurb')}
        </p>

        {/* Preset selector */}
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPreset(p.key)}
              className={`flex-1 pill pill-lg justify-center ${draft.preset === p.key ? 'pill-on' : ''}`}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>

        {/* Domain editor */}
        <div className="glass rounded-xl p-4 space-y-4">
          {DOMAIN_KEYS.map((key) => {
            const weight = draft.domains[key];
            const on = weight > 0;
            const canDisable = enabled.length > MIN_ENABLED_DOMAINS;
            return (
              <div key={key} className={on ? '' : 'opacity-50'}>
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => {
                      if (!isCustom) {
                        // Toggling a domain implicitly switches to custom.
                        setDraft(withDomainEnabled({ ...draft, preset: 'custom' }, key, !on));
                      } else {
                        setDraft(withDomainEnabled(draft, key, !on));
                      }
                    }}
                    disabled={on && !canDisable}
                    aria-pressed={on}
                    aria-label={`${t(`domains.${key}`)} ${on ? t('lifeProfile.enabled') : t('lifeProfile.disabled')}`}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                      on ? 'border-primary bg-primary/15 text-primary' : 'border-glass-border text-transparent'
                    } ${on && !canDisable ? 'opacity-60' : ''}`}
                  >
                    <span className="text-[11px] leading-none">✓</span>
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{t(`domains.${key}`)}</div>
                    <div className="text-[10px] text-text-muted">{t(DOMAIN_NOTE_KEY[key])}</div>
                  </div>
                  <div className={`font-heading text-sm font-semibold tabular-nums ${on ? 'text-primary' : 'text-text-muted'}`}>
                    {weight}%
                  </div>
                </div>
                <input
                  type="range"
                  min={MIN_DOMAIN_WEIGHT}
                  max={100}
                  step={1}
                  value={on ? weight : 0}
                  disabled={!on}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setDraft(withWeight(isCustom ? draft : { ...draft, preset: 'custom' }, key, v));
                  }}
                  className="w-full accent-primary disabled:opacity-40"
                  aria-label={t('lifeProfile.weightAria', { domain: t(`domains.${key}`) })}
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2 border-t border-glass-border">
            <span className="sec">{t('lifeProfile.total')}</span>
            <span className="font-heading text-sm font-semibold text-success">100%</span>
          </div>
        </div>

        {isCustom && (
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 text-xs py-2" onClick={() => onPreset('student')}>
              {t('lifeProfile.resetStudent')}
            </button>
            <button className="btn-ghost flex-1 text-xs py-2" onClick={() => onPreset('professional')}>
              {t('lifeProfile.resetProfessional')}
            </button>
          </div>
        )}

        <p className="text-[10px] text-text-muted text-center px-2">
          {t('lifeProfile.footer', { min: MIN_ENABLED_DOMAINS, weight: MIN_DOMAIN_WEIGHT })}
        </p>
      </div>
    </>
  );
}
