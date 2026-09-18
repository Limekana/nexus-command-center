// v1.15 (Item 12) — the desktop edition's "a newer release is out" state.
//
// One tiny store rather than a hook per component: the SideNav badge and the
// Settings "Check for updates" row both read it, and a manual check from
// Settings should light up the badge too without a second request. The work
// itself happens in the Electron main process (electron/update-check.cjs);
// this only mirrors its answer. On every non-desktop build `desktop` is null
// and the state stays idle forever.
import { useSyncExternalStore } from 'react';
import { desktop, type DesktopUpdateResult } from './desktop';

export type DesktopUpdateState =
  | { status: 'idle' | 'checking' }
  | DesktopUpdateResult;

let state: DesktopUpdateState = { status: 'idle' };
const listeners = new Set<() => void>();

function set(next: DesktopUpdateState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function checkForDesktopUpdate(force = false): void {
  if (!desktop?.checkForUpdate || state.status === 'checking') return;
  set({ status: 'checking' });
  desktop.checkForUpdate(force).then(
    (res) => set(res),
    () => set({ status: 'error', current: '', latest: null }),
  );
}

export function openDesktopUpdate(): void {
  void desktop?.openUpdate?.();
}

export function useDesktopUpdate(): DesktopUpdateState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
