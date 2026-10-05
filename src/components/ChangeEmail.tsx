// v1.17 (limecore#10) — change the account's login email, from Settings.
//
// NCC gets this alongside StudyDesk because it is the suite's sign-in source.
// All three apps share one Supabase auth user, so one updateUser({ email })
// changes the address everywhere. With "Secure email change" on (Supabase's
// default; keep it on), a link goes to the current address and one to the new
// address, and the change takes effect once both are opened. The links land on
// limecore.dev/confirmed, not in the app; until then the user keeps signing in
// with the old address, which the copy says.
//
// Only for accounts that sign in with email and password. A Google account's
// address comes from Google; changing it here is untested and would not change
// how they sign in.
//
// Release gate: supabase/migrations/20261005_kofi_match_follows_email_change.sql
// must be live before this ships, or a supporter who changes their email loses
// their Ko-fi renewals (and someone else could claim them).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isComposing } from '../lib/imeSubmit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Where the confirmation links land. The flag lets limecore.dev/confirmed say
// "email changed" rather than "account confirmed". If this URL is not on
// Supabase's redirect allow list, Supabase uses the Site URL (the same page,
// without the flag) and the change still completes.
const REDIRECT = 'https://limecore.dev/confirmed?flow=email-change';

export default function ChangeEmail({ user }: { user: User }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // From the server, so a change started on another device shows here too.
  const [pending, setPending] = useState<string | null>(null);

  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider];
  const usesPassword = !user.is_anonymous && providers.includes('email');
  const current = user.email ?? '';

  // getUser() reads the server without rotating any token, so visiting
  // Settings repeatedly is safe (the suite SSO token-burn lesson).
  useEffect(() => {
    if (!usesPassword) return undefined;
    let live = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (live) setPending(data.user?.new_email ?? null); })
      .catch(() => {});
    return () => { live = false; };
  }, [user.id, usesPassword]);

  if (!usesPassword) return null;

  const send = async () => {
    const next = value.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) { setMsg(t('settings.changeEmailInvalid')); return; }
    if (next === current.toLowerCase()) { setMsg(t('settings.changeEmailSame')); return; }
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: REDIRECT });
      if (error) throw error;
      setPending(next);
      setValue('');
      setOpen(false);
    } catch (e) {
      const err = e as { code?: string; status?: number };
      const code = err.code ?? '';
      setMsg(
        code === 'email_exists' ? t('settings.changeEmailTaken')
          : code === 'email_address_invalid' ? t('settings.changeEmailInvalid')
            : /rate_limit/.test(code) || err.status === 429 ? t('settings.changeEmailRateLimit')
              : t('settings.changeEmailFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {pending && (
        <div className="text-[0.625rem] text-text-muted mt-2">
          {t('settings.changeEmailPending', { current, next: pending })}
        </div>
      )}
      {open ? (
        <div className="space-y-2 py-2">
          <div className="text-[0.625rem] text-text-muted">{t('settings.changeEmailWhy')}</div>
          <label className="block text-[0.625rem] uppercase tracking-wider text-text-muted" htmlFor="ncc-new-email">
            {t('settings.changeEmailLabel')}
          </label>
          <input
            id="ncc-new-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || isComposing(e)) return;
              void send();
            }}
            placeholder={t('auth.emailPlaceholder')}
            autoFocus
          />
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={() => void send()} disabled={busy || !value.trim()}>
              {t('settings.changeEmailSend')}
            </button>
            <button className="btn-ghost flex-1" onClick={() => { setOpen(false); setMsg(null); }}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost w-full mt-2" onClick={() => { setOpen(true); setMsg(null); }}>
          {t('settings.changeEmail')}
        </button>
      )}
      {msg && <div className="text-[0.625rem] text-warning mt-1">{msg}</div>}
    </>
  );
}
