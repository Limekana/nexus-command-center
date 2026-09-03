// Is this the Electron desktop build?
//
// The test is the Electron user agent, which is what `lib/appOpens.ts` has
// always used to tag an open as `platform='desktop'` — this module is that
// check lifted out so there is one copy of it rather than two.
//
// A user-agent sniff is a weaker signal than asking a bridge that the shell
// actually installed, and when the desktop OAuth work lands it brings a real
// preload bridge (`window.nexusDesktop`) with it. Prefer that once it exists:
// a bridge that is present is a bridge that works, whereas a UA string is only
// a claim. Until then this is the only signal the renderer has, and it is
// accurate for the one thing it is asked here — a build we ship ourselves,
// not a hostile input.
//
// Capacitor is checked first so an Android WebView can never answer yes,
// mirroring the ordering in `appOpens.platform()`.
import { Capacitor } from '@capacitor/core';

export const IS_DESKTOP: boolean =
  !Capacitor.isNativePlatform() &&
  typeof navigator !== 'undefined' &&
  /electron/i.test(navigator.userAgent);
