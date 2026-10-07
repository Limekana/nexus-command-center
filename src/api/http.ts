import type { AxiosStatic } from 'axios';

// v1.17 (limecore#12): axios is ~158 KiB before minification, and only the
// market-data fetches use it — on Android most of them go through
// CapacitorHttp and never touch it. A static import put it in the startup
// chunk on every launch, so it now loads on the first fetch that needs it.
// One shared promise: concurrent first fetches wait on the same load. A
// failed load (offline web edition, a chunk gone after a deploy) is not
// cached, so the next fetch tries again.
let pending: Promise<AxiosStatic> | undefined;

export function loadAxios(): Promise<AxiosStatic> {
  pending ??= import('axios').then(
    (m) => m.default,
    (err) => {
      pending = undefined;
      throw err;
    },
  );
  return pending;
}
