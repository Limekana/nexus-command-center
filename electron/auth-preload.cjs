// The only bridge the main window gets. Ported from StudyDesk v1.12.1 (H2),
// which hit this bug first; NCC never got the port and carried it into v1.12.
//
// Desktop sign-in used to navigate the app's OWN window to the OAuth provider
// (`window.location.href = data.url` in Login.tsx). Supabase then bounced the
// browser to whichever redirect target it accepted, which for the desktop build
// is never `nexus://app/` — that origin cannot be in the project's allow-list as
// a plain http URL, so Supabase fell back to the project's Site URL and the
// app's window ended up parked on limecore.dev/confirmed with no route home. No
// back button, no address bar, no menu: the app was, literally, gone until
// relaunch.
//
// The desktop flow is now the loopback flow RFC 8252 prescribes for native
// apps: the provider URL opens in the user's real browser, and the code comes
// back to a listener on 127.0.0.1 that hands it here over IPC. The PKCE code
// verifier never leaves the renderer, so the exchange has to happen there —
// which is exactly what `onCallback` exists to let it do.
//
// Sandbox-safe by construction: a sandboxed preload is granted `contextBridge`
// and `ipcRenderer` and nothing else, and those are the only two things this
// file touches. `sandbox: true` on the window stays as it was.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const FLAG = '--nexus-auth-redirect=';
const arg = process.argv.find((a) => a.startsWith(FLAG));

contextBridge.exposeInMainWorld('nexusDesktop', {
  // The loopback callback URL this launch is listening on, or null if the
  // listener could not bind. The renderer uses it as Supabase's `redirectTo`.
  redirectUri: arg ? arg.slice(FLAG.length) : null,

  // Hand an https provider URL to the system browser. Returns false if the
  // main process refused it.
  beginOAuth: (url) => ipcRenderer.invoke('auth:begin', url),

  // Subscribe to the loopback callback. Returns an unsubscriber.
  onCallback: (fn) => {
    const handler = (_event, payload) => fn(payload);
    ipcRenderer.on('auth:callback', handler);
    return () => ipcRenderer.removeListener('auth:callback', handler);
  },
});
