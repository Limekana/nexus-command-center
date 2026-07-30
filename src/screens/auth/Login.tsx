// First-launch sign-in surface for NCC. Order of options reflects the
// suite-wide auth UX model:
//
//   1. Continue with Google — primary path. NCC is the SSO source for the
//      suite (LimeLog + StudyDesk inherit from NCC via SessionContentProvider),
//      so the easier we make Google sign-in here, the smoother the
//      cross-app experience is.
//   2. Use email instead    — collapsed by default. Still fully supported,
//      just not the lead affordance.
//   3. Continue as guest    — bypass auth entirely. Sets a Preferences flag
//      so the next launch goes straight to the app. User can still sign in
//      later from Settings to enable Supabase sync.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase, OAUTH_REDIRECT_URL } from '../../lib/supabase';
import { setGuestMode } from '../../lib/guestMode';
import { isOnboarded } from '../../lib/onboarding';
import { translateAuthError } from '../../lib/authErrors';

export default function Login() {
  const { t } = useTranslation();
  // v1.8 / ACT-3 — the gate used to greet everyone with "Sign in", which reads
  // as "welcome back" to someone who has never opened the app. `isOnboarded()`
  // is set at the end of onboarding, which lives *behind* this gate, so at gate
  // time an unset flag is a sound "this device has never completed first run".
  // Read once on mount: the flag can't change while the gate is on screen, and
  // re-reading would let the copy shift under the user mid-session.
  const [firstRun] = useState(() => !isOnboarded());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) {
      setError(translateAuthError(error, t));
    }
    // On success, the session store listener will pick up the new session and
    // App.tsx will re-render away from this screen.
  };

  const onGoogle = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: OAUTH_REDIRECT_URL,
          skipBrowserRedirect: true, // we control the browser ourselves
        },
      });
      if (error || !data?.url) {
        setError(translateAuthError(error, t) ?? t('auth.errGoogleStart'));
        setGoogleSubmitting(false);
        return;
      }
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: data.url, presentationStyle: 'fullscreen' });
        // The deep-link listener in App.tsx will exchangeCodeForSession when
        // Google redirects back to our scheme.
      } else {
        // Web fallback — just navigate the current tab.
        window.location.href = data.url;
      }
    } catch (e) {
      setError(translateAuthError(e as Error, t));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const onGuest = async () => {
    // Mark this device as opting out of auth. App.tsx reads the flag and
    // skips the Login gate; the rest of the app runs on local Dexie state.
    // The user can sign in later from Settings (which will clear the flag).
    //
    // v1.1 — UI/UX review #3: write the flag FIRST, then dispatch the
    // change event so the listener observes the updated value on its
    // re-read. The previous order (navigate → dispatch) was a no-op until
    // the dispatch fired; now the gate flip is deterministic. No explicit
    // navigate needed — App.tsx re-renders to Dashboard once the gate
    // condition flips.
    setError(null);
    await setGuestMode(true);
    window.dispatchEvent(new CustomEvent('nexus:guest-mode-changed'));
  };

  return (
    <div className="min-h-full bg-bg text-text flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
        {/* "Nexus" is the product name — deliberately not a translation key. */}
        <div className="mb-8">
          <h1 className="font-heading font-bold text-3xl tracking-tight">Nexus</h1>
          <p className="text-sm text-text-muted mt-1">
            {firstRun ? t('auth.firstRunSubtitle') : t('auth.signInSubtitle')}
          </p>
          {/* ACT-3: on first run, lead with the local-first promise rather than
              an account pitch — this is the screen where "you don't need an
              account" has to land, and the guest control itself is the last
              thing on the page. */}
          {firstRun && (
            <p className="text-xs text-primary/90 mt-2">{t('auth.firstRunPromise')}</p>
          )}
        </div>

        {/* Primary affordance — Google. Suite-wide SSO source. */}
        <button
          type="button"
          onClick={onGoogle}
          disabled={googleSubmitting}
          className="btn w-full flex items-center justify-center gap-2"
        >
          <GoogleG />
          {googleSubmitting ? t('auth.googleOpening') : t('auth.google')}
        </button>

        {/* Email/password — secondary, collapsed by default.
            v1.1 — UI/UX review #1: was a text-only button (~18px tall).
            Now py-3 + w-full → 44px+ tap target while keeping the
            secondary visual treatment. */}
        {!showEmail ? (
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="w-full text-center text-xs text-text-muted mt-3 py-3 underline-offset-2 hover:underline rounded-md"
          >
            {t('auth.useEmail')}
          </button>
        ) : (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                {t('auth.orUseEmail')}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">
                  {t('auth.emailLabel')}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  className="input w-full"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">
                  {t('auth.passwordLabel')}
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={10}
                  className="input w-full"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                />
              </div>

              <button type="submit" disabled={submitting} className="btn-ghost w-full">
                {submitting ? t('auth.signingIn') : t('auth.signInEmail')}
              </button>
            </form>

            <p className="text-center text-xs text-text-muted mt-4">
              {t('auth.noAccount')}{' '}
              <Link to="/auth/signup" className="text-primary">
                {t('auth.signUp')}
              </Link>
            </p>
          </>
        )}

        {error && (
          <div className="alert alert-warn text-xs mt-4">
            <span className="w-2 h-2 rounded-full bg-danger" />
            <span>{error}</span>
          </div>
        )}

        {/* Guest path — clearly last, but a real option. The line above it
            is visually distinct so it doesn't look like a third sign-in
            method. Caption explains the trade-off so the user knows what
            they're opting out of.
            v1.1 — UI/UX review #2: button was text-only (~20px tall).
            Now full-width with py-3 + min-h-[44px] to meet WCAG 2.5.5
            without losing the visually-tertiary treatment (no fill, no
            border — opt-out path stays clearly de-emphasized vs the
            sign-in CTAs above). #6: disclaimer bumped 10px → 11px. */}
        <div className="mt-10 pt-6 border-t border-border/60 flex flex-col items-center">
          <button
            type="button"
            onClick={onGuest}
            className="w-full min-h-[44px] py-3 text-sm text-text-muted hover:text-text underline-offset-2 hover:underline rounded-md"
          >
            {t('auth.guest')}
          </button>
          <p className="text-[11px] text-text-muted mt-1.5 text-center px-4 leading-relaxed">
            {t('auth.guestCaption')}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
