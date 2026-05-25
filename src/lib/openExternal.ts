// Open an external URL the right way for the current platform.
//
// On native (Capacitor) we use @capacitor/browser which opens a Chrome
// Custom Tab — the URL renders in-app inside the OS-provided browser
// surface, preserving the user's session/cookies but not handing them
// to a different app. Faster transition than launching the system
// browser, and the user returns to Nexus when they hit back.
//
// On web (dev preview) we fall back to window.open with noopener so the
// new tab can't tamper with our window.
//
// The Browser.open call is fire-and-forget — any error (e.g. user denied
// the intent) is swallowed and logged. Refusing to open a URL shouldn't
// crash the screen that called us.

import { Capacitor } from '@capacitor/core';

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url, presentationStyle: 'popover' });
    } catch (e) {
      console.warn('[openExternalUrl] Browser.open failed:', (e as Error).message);
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
