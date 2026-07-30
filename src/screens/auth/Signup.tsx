import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { translateAuthError } from '../../lib/authErrors';

export default function Signup() {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = (): string | null => {
    if (!fullName.trim()) return t('auth.errNameRequired');
    if (password.length < 10) return t('auth.errPasswordShort');
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return t('auth.errPasswordWeak');
    }
    if (password !== confirm) return t('auth.errPasswordMismatch');
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });
    setSubmitting(false);
    if (error) {
      setError(translateAuthError(error, t));
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-full bg-bg text-text flex flex-col">
        <div className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
          <h1 className="font-heading font-bold text-2xl tracking-tight mb-2">
            {t('auth.checkEmailTitle')}
          </h1>
          <p className="text-sm text-text-muted mb-6">
            <Trans
              i18nKey="auth.checkEmailBody"
              values={{ email }}
              components={{ 1: <span className="text-text" /> }}
            />
          </p>
          <Link to="/auth/login" className="btn w-full text-center">
            {t('auth.backToSignIn')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-bg text-text flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
        <div className="mb-8">
          <h1 className="font-heading font-bold text-3xl tracking-tight">
            {t('auth.createTitle')}
          </h1>
          {/* Product name — deliberately not a translation key. */}
          <p className="text-sm text-text-muted mt-1">Nexus Command Center</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">
              {t('auth.fullNameLabel')}
            </label>
            <input
              type="text"
              autoComplete="name"
              required
              className="input w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('auth.fullNamePlaceholder')}
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={10}
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
            />
            <p className="text-[10px] text-text-muted mt-1">{t('auth.passwordHint')}</p>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">
              {t('auth.confirmPasswordLabel')}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="input w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && (
            <div className="alert alert-warn text-xs">
              <span className="w-2 h-2 rounded-full bg-danger" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn w-full">
            {submitting ? t('auth.creatingAccount') : t('auth.createAccount')}
          </button>
        </form>

        {/* GDPR Art. 8 — consent for an information society service is only
            valid from 16 (13 in some member states). We cannot verify ages and
            are not expected to, but the policy states the limit, so the signup
            form should too rather than leaving it somewhere nobody reads. It
            also points at the option that needs no account at all. */}
        <p className="text-[10px] text-text-muted mt-6 leading-relaxed text-center">
          {t('auth.ageNote')}{' '}
          <a
            href="https://limekana.github.io/nexus-command-center/legal/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary"
          >
            {t('auth.privacyLink')}
          </a>
        </p>

        <p className="text-center text-xs text-text-muted mt-6">
          {t('auth.haveAccount')}{' '}
          <Link to="/auth/login" className="text-primary">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
