// The Electron shell's bridge, or null on every other platform. NCC port of
// StudyDesk v1.12.1 / H2.
//
// `electron/auth-preload.cjs` puts this on `window` before any page script
// runs, so reading it at module scope is safe. Everything that needs to know
// "am I the desktop build" asks here rather than sniffing the user agent: a
// bridge that is present is a bridge that works, whereas a user-agent string is
// a claim about the environment that nothing has to honour.

/** What `electron/auth-preload.cjs` exposes. Kept in lockstep with that file —
 *  it is the only writer of `window.nexusDesktop`. */
export interface NexusDesktopBridge {
  /** The loopback callback URL this launch is listening on, or null if no
   *  candidate port was free. */
  readonly redirectUri: string | null;
  /** Hand an https provider URL to the system browser. Resolves false if the
   *  main process refused it. */
  beginOAuth(url: string): Promise<boolean>;
  /** Subscribe to the loopback callback. Returns an unsubscriber. */
  onCallback(fn: (payload: { code: string | null; error: string | null }) => void): () => void;
}

declare global {
  interface Window {
    /** Present only under the Electron shell; undefined on web and Android. */
    nexusDesktop?: NexusDesktopBridge;
  }
}

export const desktop: NexusDesktopBridge | null =
  (typeof window !== 'undefined' && window.nexusDesktop) || null;

/** True only in the Electron desktop build. */
export const IS_DESKTOP = desktop !== null;

/** The loopback OAuth callback this launch is listening on, or null — either
 *  because this is not the desktop build, or because no candidate port was
 *  free. A null here means desktop OAuth is unavailable this launch; email
 *  sign-in needs no redirect and is unaffected. */
export const DESKTOP_REDIRECT_URL: string | null = desktop?.redirectUri || null;
