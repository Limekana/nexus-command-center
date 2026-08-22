// hCaptcha support for Supabase Auth. Kept in lockstep with StudyDesk's
// src/lib/captcha.js and LimeLog's src/lib/captcha.ts — same reasoning, same
// behaviour, so the three apps cannot drift on an auth-critical path.
//
// WHY THIS IS LAZY RATHER THAN A WIDGET ON THE AUTH SCREEN
//
// Supabase's captcha setting is project-wide and all-or-nothing: turning it on
// requires a token on signUp, signInWithPassword, signInWithOtp, resend and
// password recovery, for every client at once. So the app cannot know at build
// time whether a token is needed.
//
// The obvious implementation — render an hCaptcha widget on the auth screen —
// would load a third-party script from hcaptcha.com every time anyone opened
// the sign-in screen, including in the F-Droid build, and including for the
// entire period where the project setting is OFF and no token is wanted at
// all. This suite has already been caught once shipping undisclosed hosts
// (linsui, !41550), so a script that runs on every launch to do nothing is
// exactly the wrong default.
//
// Instead: attempt the auth call with no token. If, and only if, the server
// answers that a captcha is required, load hCaptcha, solve it, and retry. With
// the project setting off, nothing here ever touches the network.
//
// The sitekey is public by design — every hCaptcha integration renders it into
// the page. The SECRET key is not here and must never be: it goes in the
// Supabase dashboard (Auth -> Bot and Abuse Protection) and nowhere else.

export const HCAPTCHA_SITEKEY = 'd11a811a-cac6-4a62-86a8-c476d5bc4fba';

const SCRIPT_SRC = 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=__nccHcaptchaReady';
const MEMO_KEY = 'nexus-captcha-required';

interface HCaptcha {
  render(el: HTMLElement, opts: { sitekey: string; size: string }): string;
  reset(id: string): void;
  execute(id: string, opts: { async: true }): Promise<{ response: string }>;
}

declare global {
  interface Window {
    hcaptcha?: HCaptcha;
    __nccHcaptchaReady?: () => void;
  }
}

let scriptPromise: Promise<HCaptcha> | null = null;
let widgetId: string | null = null;

function remembersRequirement(): boolean {
  try {
    return localStorage.getItem(MEMO_KEY) === '1';
  } catch {
    return false;   // private mode; costs one rejected request per attempt
  }
}

function rememberRequirement(): void {
  try {
    localStorage.setItem(MEMO_KEY, '1');
  } catch {
    // Non-fatal: the retry path still works, only the memo is lost.
  }
}

function loadScript(): Promise<HCaptcha> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<HCaptcha>((resolve, reject) => {
    // hCaptcha's explicit-render mode calls a global when ready. Namespaced so
    // it cannot collide with anything else on the page.
    window.__nccHcaptchaReady = () => {
      if (window.hcaptcha) resolve(window.hcaptcha);
      else reject(new Error('hcaptcha loaded without an api'));
    };
    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.defer = true;
    el.onerror = () => {
      scriptPromise = null;   // let a later attempt retry the load
      reject(new Error('hcaptcha script failed to load'));
    };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

async function ensureWidget(): Promise<HCaptcha> {
  const hcaptcha = await loadScript();
  if (widgetId !== null) return hcaptcha;

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // Zero-sized but still laid out. `display: none` is tempting and wrong: an
  // invisible widget still needs a live element to anchor its challenge overlay
  // to, and an undisplayed host can leave the challenge unable to open — which
  // looks like a silent hang rather than a puzzle.
  host.style.cssText = 'position:fixed;bottom:0;left:0;width:0;height:0;overflow:hidden';
  document.body.appendChild(host);

  widgetId = hcaptcha.render(host, { sitekey: HCAPTCHA_SITEKEY, size: 'invisible' });
  return hcaptcha;
}

/** Runs the challenge and resolves with a token. Rejects if the user dismisses
 *  it or the script cannot load. */
export async function solveCaptcha(): Promise<string | undefined> {
  const hcaptcha = await ensureWidget();
  if (widgetId === null) return undefined;
  // Tokens are single-use and short-lived, so always start from a clean widget
  // rather than risk replaying a stale one.
  hcaptcha.reset(widgetId);
  const result = await hcaptcha.execute(widgetId, { async: true });
  return result?.response;
}

/** True when a Supabase auth error is the server asking for a captcha. */
export function isCaptchaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = String(e.code ?? '').toLowerCase();
  const message = String(e.message ?? '').toLowerCase();
  return code.includes('captcha') || message.includes('captcha');
}

/**
 * Runs a Supabase auth call, adding a captcha token only if the server asks.
 * `run` receives the token to pass as `options.captchaToken`; undefined on the
 * first, unchallenged attempt.
 */
export async function withCaptcha<T extends { error?: unknown }>(
  run: (captchaToken: string | undefined) => Promise<T>,
): Promise<T> {
  if (remembersRequirement()) {
    return run(await solveCaptcha());
  }

  const first = await run(undefined);
  if (!isCaptchaError(first?.error)) return first;

  rememberRequirement();
  return run(await solveCaptcha());
}
