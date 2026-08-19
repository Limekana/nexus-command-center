// ─── v1.6 First-run onboarding ───────────────────────────────────────────
//
// Shown once on a fresh install (no Life Profile configured, onboarding flag
// unset). Four steps, skippable at every one:
//   1. Welcome      — NCC branding + "set up your life OS"
//   2. Life Profile — Student / Professional / Custom preset picker (applies
//                     immediately via the store; fine-tuning lives in Settings)
//   3. Domains      — confirm which domains are active, one-line descriptions
//   4. First goal   — optional CTA to set a goal now, else "set up later"
// Then lands on Home.
//
// Cyber Slate Glass — panel surfaces, pill selector, cyan accents, the app's
// ambient mesh shows through from the shell behind.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLifeProfileStore } from '../store/useLifeProfileStore';
import {
  DOMAIN_KEYS,
  enabledDomains,
  presetProfile,
  type DomainKey,
  type LifeProfilePreset,
} from '../lib/lifeProfile';
import { setOnboarded } from '../lib/onboarding';
import { type Lang } from '../i18n';
import LanguageGrid from '../components/LanguageGrid';
import Glyph from '../components/Glyph';

interface Props {
  /** Called when the wizard finishes or is skipped. Parent flips the gate. */
  onDone: () => void;
}

export default function Onboarding({ onDone }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const currentLang = (i18n.language || 'en').split('-')[0] as Lang;
  const profile = useLifeProfileStore((s) => s.profile);
  const setProfile = useLifeProfileStore((s) => s.setProfile);
  const [step, setStep] = useState(0);
  // Default the picker highlight to the current (Student-default) preset.
  const [picked, setPicked] = useState<LifeProfilePreset>(profile.preset);

  const presets: { key: Exclude<LifeProfilePreset, 'custom'>; descKey: string }[] = [
    { key: 'student', descKey: 'onboarding.presetStudentDesc' },
    { key: 'professional', descKey: 'onboarding.presetProfessionalDesc' },
  ];

  const domainNote: Record<DomainKey, string> = {
    finance: t('onboarding.domainFinance'),
    fitness: t('onboarding.domainFitness'),
    studies: t('onboarding.domainStudies'),
    work: t('onboarding.domainWork'),
    habits: t('onboarding.domainHabits'),
  };

  function choosePreset(preset: Exclude<LifeProfilePreset, 'custom'>) {
    setPicked(preset);
    void setProfile(presetProfile(preset));
  }

  function finish(goToGoals: boolean) {
    setOnboarded();
    onDone();
    if (goToGoals) navigate('/goals');
  }

  const enabled = enabledDomains(profile);

  return (
    <div className="onb-screen min-h-full bg-bg text-text flex flex-col items-center justify-center px-5 py-8">
      {/* v1.9 Item 14 — Onboarding renders outside AppShell too, so it kept
          its 448px phone column on desktop. Same per-tier scale-up as
          LockScreen and Login; still centred, since a first-run wizard
          stretched across the full width would read worse, not better. */}
      <div className="onb-rise relative z-10 w-full max-w-md tablet:max-w-lg desktop:max-w-2xl space-y-5 desktop:space-y-7">
        {/* Brand */}
        <div className="text-center">
          <div className="onb-wordmark font-heading text-3xl font-bold tracking-tight text-text uppercase">
            {t('app.name')}
          </div>
          <div className="text-[0.6875rem] uppercase tracking-[0.18em] text-text-muted mt-1">
            {t('app.tagline')}
          </div>
        </div>

        {/* Progress rail — five steps */}
        <div className="onb-rail">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`onb-seg${i < step ? ' on' : ''}${i === step ? ' cur' : ''}`}><i /></span>
          ))}
        </div>

        {/* Step card */}
        <div className="onb-card p-6 space-y-5">
          <div className="onb-body space-y-5" key={step}>
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="font-heading text-xl font-bold">{t('onboarding.languageTitle')}</h1>
              <p className="text-sm text-text-muted leading-relaxed">{t('onboarding.languageBody')}</p>
              <LanguageGrid current={currentLang} variant="onboarding" />
              <button className="btn w-full" onClick={() => setStep(1)}>
                {t('common.continue')}
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-full bg-surface2 border border-border text-primary flex items-center justify-center mx-auto">
                <Glyph name="sparkle" size={22} strokeWidth={1.5} />
              </div>
              <h1 className="font-heading text-2xl font-bold">{t('onboarding.welcomeTitle')}</h1>
              <p className="text-sm text-text-muted leading-relaxed">{t('onboarding.welcomeBody')}</p>
              <button className="btn w-full" onClick={() => setStep(2)}>
                {t('onboarding.getStarted')}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h1 className="font-heading text-xl font-bold">{t('onboarding.profileTitle')}</h1>
              <p className="text-sm text-text-muted leading-relaxed">{t('onboarding.profileBody')}</p>
              <div className="space-y-2">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => choosePreset(p.key)}
                    aria-pressed={picked === p.key}
                    className={`w-full text-start panel-2 p-3 border transition-colors ${
                      picked === p.key ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{t(`onboarding.preset_${p.key}`)}</span>
                      {picked === p.key && <Glyph name="check" size={13} className="text-primary" />}
                    </div>
                    <div className="text-[0.6875rem] text-text-muted mt-0.5">{t(p.descKey)}</div>
                  </button>
                ))}
              </div>
              <p className="text-[0.625rem] text-text-muted text-center">{t('onboarding.profileCustomHint')}</p>
              <button className="btn w-full" onClick={() => setStep(3)}>
                {t('common.continue')}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h1 className="font-heading text-xl font-bold">{t('onboarding.domainsTitle')}</h1>
              <p className="text-sm text-text-muted leading-relaxed">{t('onboarding.domainsBody')}</p>
              <div className="space-y-2">
                {DOMAIN_KEYS.map((key) => {
                  const on = enabled.includes(key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-3 panel-2 p-3 ${on ? '' : 'opacity-40'}`}
                    >
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                          on ? 'border-primary bg-primary/15 text-primary' : 'border-border text-transparent'
                        }`}
                      >
                        <Glyph name="check" size={11} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{t(`domains.${key}`)}</div>
                        <div className="text-[0.625rem] text-text-muted">{domainNote[key]}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="btn w-full" onClick={() => setStep(4)}>
                {t('common.continue')}
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <span aria-hidden className="text-2xl leading-none">◎</span>
              </div>
              <h1 className="font-heading text-xl font-bold">{t('onboarding.goalTitle')}</h1>
              <p className="text-sm text-text-muted leading-relaxed">{t('onboarding.goalBody')}</p>
              <button className="btn w-full" onClick={() => finish(true)}>
                {t('onboarding.setGoal')}
              </button>
              <button className="btn-ghost w-full text-sm" onClick={() => finish(false)}>
                {t('onboarding.goalLater')}
              </button>
            </div>
          )}
          </div>
        </div>

        {/* Skip — available on every step except the final goal step (which has
            its own "later" affordance). */}
        {step < 4 && (
          <button
            className="block mx-auto text-xs uppercase tracking-wider text-text-muted py-3 px-4"
            onClick={() => finish(false)}
          >
            {t('onboarding.skip')}
          </button>
        )}
      </div>
    </div>
  );
}
