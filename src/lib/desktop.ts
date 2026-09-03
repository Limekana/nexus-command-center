// v1.12.1 — the Electron shell's bridge, or null on every other platform.
//
// `electron/auth-preload.cjs` puts this on `window` before any page script
// runs, so reading it at module scope is safe. Everything that needs to know
// "am I the desktop build" asks here rather than sniffing the user agent: a
// bridge that is present is a bridge that works.

export type DesktopAuthCallback = { code: string | null; error: string | null };

export type DesktopBridge = {
  /** The loopback OAuth callback this launch is listening on, or null if no
   *  candidate port was free. */
  redirectUri: string | null;
  /** Hand an https provider URL to the system browser. */
  beginOAuth: (url: string) => Promise<boolean>;
  /** Subscribe to the loopback callback. Returns an unsubscriber. */
  onCallback: (fn: (payload: DesktopAuthCallback) => void) => () => void;
};

declare global {
  interface Window {
    nexusDesktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | null =
  (typeof window !== 'undefined' && window.nexusDesktop) || null;

/** True only in the Electron desktop build. */
export const IS_DESKTOP = desktop !== null;

/** Null means desktop OAuth is unavailable this launch (or this is not the
 *  desktop build at all); email sign-in needs no redirect and is unaffected. */
export const DESKTOP_REDIRECT_URL: string | null = desktop?.redirectUri ?? null;
