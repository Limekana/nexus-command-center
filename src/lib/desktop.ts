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
  /** v1.15 — ask the main process whether a newer release exists.
   *  `force` skips its once-per-launch cache. */
  checkForUpdate: (force?: boolean) => Promise<DesktopUpdateState>;
  /** Download the update found by the last check (electron-updater). */
  downloadUpdate: () => Promise<boolean>;
  /** Quit, install the downloaded update silently, relaunch. */
  installUpdate: () => Promise<boolean>;
  /** Open the release page the main process found. */
  openUpdate: () => Promise<boolean>;
  /** State pushes (progress, ready). Returns an unsubscriber. */
  onUpdateState: (fn: (state: DesktopUpdateState) => void) => () => void;
};

export type DesktopUpdateState = {
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'error';
  current?: string;
  latest?: string | null;
  /** False = notice only: the action opens the release page. */
  canInstall: boolean;
  percent: number;
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
