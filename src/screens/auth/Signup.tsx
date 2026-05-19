import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = (): string | null => {
    if (!fullName.trim()) return 'Enter your name.';
    if (password.length < 10) return 'Password must be at least 10 characters.';
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return 'Password needs upper + lower case, a digit, and a symbol.';
    }
    if (password !== confirm) return 'Passwords do not match.';
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
      setError(error.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-full bg-bg text-text flex flex-col">
        <div className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
          <h1 className="font-heading font-bold text-2xl tracking-tight mb-2">Check your email</h1>
          <p className="text-sm text-text-muted mb-6">
            We sent a confirmation link to <span className="text-text">{email}</span>. Click it
            to verify, then come back here and sign in.
          </p>
          <Link to="/auth/login" className="btn w-full text-center">
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-bg text-text flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
        <div className="mb-8">
          <h1 className="font-heading font-bold text-3xl tracking-tight">Create account</h1>
          <p className="text-sm text-text-muted mt-1">Nexus Command Center</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Full Name
            </label>
            <input
              type="text"
              autoComplete="name"
              required
              className="input w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Emil Heinonen"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters"
            />
            <p className="text-[10px] text-text-muted mt-1">
              Needs upper + lower case, a digit, and a symbol.
            </p>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Confirm Password
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
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-text-muted mt-6">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
