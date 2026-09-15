// Deliberate probe, v1.14 / WEB-1 diagnosis.
//
// `/api/cg/[...path].ts` is committed, is in the production commit, and 404s
// on both its own path and through the `/cg/*` rewrite — with no
// `x-cg-proxy-key` header, so it never executes. The production build log
// shows only the Vite build and never builds anything out of `api/`.
//
// Two candidate causes, and they need different fixes:
//   1. Vercel is ignoring the whole `api/` directory.
//   2. Vercel picks up `api/` but chokes on THAT file — the `[...path]`
//      catch-all name, or `export const config = { runtime: 'edge' }`.
//
// This file is the discriminator: plainest possible function, no brackets in
// the name, no runtime config. If `/api/health` answers on the branch preview
// and `/api/cg/...` still does not, the cause is (2). If neither answers, (1).
//
// Delete once WEB-1 is closed.

export default function handler() {
  return new Response(JSON.stringify({ ok: true, probe: 'web-1' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
