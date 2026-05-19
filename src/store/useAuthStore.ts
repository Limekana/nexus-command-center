// Local auth — PIN + biometric. Holds no sensitive material in memory; the
// PIN hash lives in Capacitor Preferences and is verified on every unlock.
//
// PIN HASH FORMAT
// ──────────────────────────────────────────────────────────────────────────
//   v2:<salt_b64>:<hash_b64>          (current — PBKDF2-SHA256, 250k iters)
//   <64 hex chars>                    (v1 legacy — bare SHA-256, no salt)
//
// v1 was unsalted SHA-256, which is precomputable against a 6-digit PIN in
// well under a second. We can't force-migrate without making the user enter
// their PIN (the salt is derived from a successful verification), so on every
// successful unlock against a v1 hash we transparently re-hash with v2 and
// write that back. After one unlock, the stored format is upgraded.
//
// BRUTE-FORCE PROTECTION
// ──────────────────────────────────────────────────────────────────────────
// Failed PIN attempts are persisted across app restarts (counter + last-fail
// timestamp). Lockout windows are tiered:
//
//   5 failures   →  30 sec   (slows scripted attacks)
//   10 failures  →   5 min   (kills "let me try a hundred more")
//   20 failures  →  15 min   (a 6-digit space brute force becomes years)
//
// The counter resets only on successful unlock or on `setPin` (e.g. after
// "Clear All Data" recovery). Lockout is enforced server-of-truth here, BUT
// because all state is local, the threat model is "stolen unlocked device"
// or "rooted device with adb shell input" — a sufficiently determined
// adversary can still attack the on-disk hash directly. PBKDF2 + salt makes
// that attack expensive (~250k SHA-256 per guess); real at-rest encryption
// of the IndexedDB is the next defense-in-depth step (tracked separately).

import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';

const PIN_KEY = 'auth.pin';
const AUTOLOCK_KEY = 'auth.autoLockMin';
const BIOMETRIC_KEY = 'auth.biometricEnabled';
const PIN_ATTEMPTS_KEY = 'auth.pinFailedAttempts';
const PIN_LAST_FAIL_KEY = 'auth.pinLastFailAt';

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const HASH_FORMAT_VERSION = 'v2';

// Lockout schedule — cumulative: at N failed attempts, lock for X seconds.
// Highest threshold wins (i.e. 20 attempts → 15min, not the sum).
const LOCKOUT_TIERS: Array<{ attempts: number; lockSeconds: number }> = [
  { attempts: 20, lockSeconds: 15 * 60 },
  { attempts: 10, lockSeconds: 5 * 60 },
  { attempts: 5, lockSeconds: 30 },
];

// ── Preferences helpers ───────────────────────────────────────────────────

async function getPref(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return localStorage.getItem(key);
  }
}
async function setPref(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    localStorage.setItem(key, value);
  }
}
async function removePref(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
  } catch {
    localStorage.removeItem(key);
  }
}

// ── Crypto primitives ─────────────────────────────────────────────────────

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(pin: string, salt: Uint8Array): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return b64encode(new Uint8Array(bits));
}

// Legacy v1: bare 64-hex SHA-256 of the PIN. Used only to verify-and-upgrade
// existing users' stored hashes.
async function legacySha256(pin: string): Promise<string> {
  const enc = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isLegacyHash(stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored);
}

function parseV2(stored: string): { salt: Uint8Array; hash: string } | null {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== HASH_FORMAT_VERSION) return null;
  try {
    return { salt: b64decode(parts[1]), hash: parts[2] };
  } catch {
    return null;
  }
}

async function hashPinV2(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(pin, salt);
  return `${HASH_FORMAT_VERSION}:${b64encode(salt)}:${hash}`;
}

// Constant-time string compare. Important even locally: if a future feature
// exposes verifyPin to repeated automated calls (e.g. via a webhook or test
// harness), early-exit `===` leaks PIN bytes via response timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getLockoutSecondsForAttempts(attempts: number): number {
  for (const tier of LOCKOUT_TIERS) {
    if (attempts >= tier.attempts) return tier.lockSeconds;
  }
  return 0;
}

// ── Store ─────────────────────────────────────────────────────────────────

export interface VerifyResult {
  ok: boolean;
  // Present when verification was refused (or just rejected) due to lockout.
  // `remainingSeconds` is the wall-clock seconds the UI should show.
  locked?: { until: number; remainingSeconds: number; totalAttempts: number };
}

interface AuthStore {
  unlocked: boolean;
  hasPin: boolean;
  biometricEnabled: boolean;
  autoLockMinutes: number;
  lastActivity: number;
  /** Epoch ms; 0 = not currently locked out. Surface this in UI for countdown. */
  lockedUntil: number;
  failedAttempts: number;

  init: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<VerifyResult>;
  unlock: () => void;
  lock: () => void;
  bumpActivity: () => void;
  setBiometric: (on: boolean) => Promise<void>;
  setAutoLock: (minutes: number) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  unlocked: false,
  hasPin: false,
  biometricEnabled: true,
  autoLockMinutes: 5,
  lastActivity: Date.now(),
  lockedUntil: 0,
  failedAttempts: 0,

  async init() {
    const [pin, autoLock, bio, attempts, lastFailAt] = await Promise.all([
      getPref(PIN_KEY),
      getPref(AUTOLOCK_KEY),
      getPref(BIOMETRIC_KEY),
      getPref(PIN_ATTEMPTS_KEY),
      getPref(PIN_LAST_FAIL_KEY),
    ]);

    // Coerce legacy "Never auto-lock" (saved as 0) to a 60-minute cap. The
    // "Never" option was removed for security reasons; existing users get
    // bumped to the longest sane window instead of staying perpetually
    // unlocked.
    let autoLockMin = autoLock ? Number(autoLock) : 5;
    if (!Number.isFinite(autoLockMin) || autoLockMin <= 0) autoLockMin = 60;

    const failedAttempts = attempts ? Number(attempts) : 0;
    const lastFail = lastFailAt ? Number(lastFailAt) : 0;
    const lockoutSec = getLockoutSecondsForAttempts(failedAttempts);
    const lockedUntilCandidate = lastFail && lockoutSec > 0 ? lastFail + lockoutSec * 1000 : 0;

    set({
      hasPin: !!pin,
      autoLockMinutes: autoLockMin,
      biometricEnabled: bio !== '0',
      failedAttempts,
      lockedUntil: lockedUntilCandidate > Date.now() ? lockedUntilCandidate : 0,
    });
  },

  async setPin(pin) {
    const stored = await hashPinV2(pin);
    await setPref(PIN_KEY, stored);
    // Fresh PIN → wipe lockout state so the user isn't punished for whatever
    // PIN they were guessing before resetting.
    await removePref(PIN_ATTEMPTS_KEY);
    await removePref(PIN_LAST_FAIL_KEY);
    set({ hasPin: true, failedAttempts: 0, lockedUntil: 0 });
  },

  async verifyPin(pin) {
    const now = Date.now();
    const state = get();

    // Hard gate on lockout — don't even compute the hash if locked out, both
    // to surface the lockout cleanly and to deny the attacker any
    // unintended timing signal.
    if (state.lockedUntil > now) {
      return {
        ok: false,
        locked: {
          until: state.lockedUntil,
          remainingSeconds: Math.ceil((state.lockedUntil - now) / 1000),
          totalAttempts: state.failedAttempts,
        },
      };
    }

    const stored = await getPref(PIN_KEY);
    if (!stored) return { ok: false };

    let matched = false;

    if (isLegacyHash(stored)) {
      // v1 path: legacy unsalted SHA-256. Verify, and on success transparently
      // upgrade to v2 so subsequent unlocks use the safer hash.
      const candidate = await legacySha256(pin);
      matched = timingSafeEqual(candidate, stored);
      if (matched) {
        const upgraded = await hashPinV2(pin);
        await setPref(PIN_KEY, upgraded);
      }
    } else {
      const v2 = parseV2(stored);
      if (!v2) return { ok: false };
      const candidate = await pbkdf2(pin, v2.salt);
      matched = timingSafeEqual(candidate, v2.hash);
    }

    if (matched) {
      await removePref(PIN_ATTEMPTS_KEY);
      await removePref(PIN_LAST_FAIL_KEY);
      set({ failedAttempts: 0, lockedUntil: 0 });
      return { ok: true };
    }

    // Bump and persist the failure counter.
    const nextAttempts = state.failedAttempts + 1;
    await setPref(PIN_ATTEMPTS_KEY, String(nextAttempts));
    await setPref(PIN_LAST_FAIL_KEY, String(now));
    const lockoutSec = getLockoutSecondsForAttempts(nextAttempts);
    const newLockedUntil = lockoutSec > 0 ? now + lockoutSec * 1000 : 0;
    set({ failedAttempts: nextAttempts, lockedUntil: newLockedUntil });

    if (newLockedUntil > 0) {
      return {
        ok: false,
        locked: {
          until: newLockedUntil,
          remainingSeconds: lockoutSec,
          totalAttempts: nextAttempts,
        },
      };
    }
    return { ok: false };
  },

  unlock() {
    set({ unlocked: true, lastActivity: Date.now() });
  },

  lock() {
    set({ unlocked: false });
  },

  bumpActivity() {
    set({ lastActivity: Date.now() });
  },

  async setBiometric(on) {
    await setPref(BIOMETRIC_KEY, on ? '1' : '0');
    set({ biometricEnabled: on });
  },

  async setAutoLock(minutes) {
    await setPref(AUTOLOCK_KEY, String(minutes));
    set({ autoLockMinutes: minutes });
  },
}));
