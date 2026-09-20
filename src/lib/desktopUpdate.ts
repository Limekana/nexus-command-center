// v1.15 (Item 12) — the desktop edition's update state, mirrored from the
// Electron main process (electron/updater.cjs), which does all the work.
//
// One tiny store rather than a hook per component: the SideNav button and the
// Settings row both read it, and a check or download started from one shows
// in the other. On every non-desktop build `desktop` is null and the state
// stays idle forever.
import { useSyncExternalStore } from 'react';
import { desktop, type DesktopUpdateState } from './desktop';

let state: DesktopUpdateState = { status: 'idle', canInstall: false, percent: 0 };
const listeners = new Set<() => void>();
let wired = false;

function set(next: Partial<DesktopUpdateState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Progress arrives as pushes, not as the answer to a call.
function wire() {
  if (wired || !desktop?.onUpdateState) return;
  wired = true;
  desktop.onUpdateState((s) => set(s));
}

export function checkForDesktopUpdate(force = false): void {
  if (!desktop?.checkForUpdate) return;
  wire();
  if (state.status === 'checking' || state.status === 'downloading') return;
  set({ status: 'checking' });
  desktop.checkForUpdate(force).then(
    (s) => set(s),
    () => set({ status: 'error' }),
  );
}

/** The one thing the update button does in the current state. */
export function runDesktopUpdateAction(): void {
  if (!desktop) return;
  if (state.status === 'ready') void desktop.installUpdate?.();
  else if (state.status === 'available' && state.canInstall) void desktop.downloadUpdate?.();
  else if (state.status === 'available') void desktop.openUpdate?.();
}

export function useDesktopUpdate(): DesktopUpdateState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
