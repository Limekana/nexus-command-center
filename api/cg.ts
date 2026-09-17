// CoinGecko proxy for the web edition — WEB-1.
//
// ── THE BUG THIS FIXES ───────────────────────────────────────────────────
//
// CoinGecko blocks Vercel's datacenter IP ranges, so the plain rewrite that
// used to serve `/cg/*` returned 403 on every call and crypto quotes were
// dead in the browser. Measured 2026-08-14: 403 on three consecutive attempts
// from the deployment, 200 for the identical call from a residential IP.
// Native builds were never affected — CapacitorHttp calls the upstream
// straight from the device IP.
//
// A free CoinGecko *demo* key lifts the datacenter-IP block. The key has to be
// attached server-side, which is the whole reason this is a function and not a
// rewrite: `vercel.json` cannot inject a header or interpolate an env var, so
// the only way to attach it declaratively would be to hardcode the credential
// in a file committed to a public repo.
//
// The key therefore lives in the Vercel project's environment as
// COINGECKO_DEMO_KEY and never enters the repo or the client bundle.
//
// ── AND THE SECOND BUG, WHICH IS WHY THIS FILE IS SHAPED LIKE THIS ───────
//
// The above shipped in v1.12 as `api/cg/[...path].ts`, using Vercel's
// catch-all filename convention, and it never worked. Vercel's build silently
// skipped the file: nothing appeared in the build log, and both `/cg/*` and
// the function's own path returned 404 with no `x-cg-proxy-key` header, so
// the handler was never invoked. WEB-1 therefore turned a 403 into a 404 and
// was recorded as "code done, waiting on the key" for a month, while the env
// var it was waiting for had nothing to be read by.
//
// Confirmed 2026-09-15 by pushing a plain `api/health.ts` alongside it: that
// build compiled one more function than the identical production build with
// only the bracketed file present. So `api/` IS scanned, and the `[...path]`
// name is what gets dropped — square brackets are glob character-class
// syntax, and a scanner that does not escape them cannot match the file.
//
// So: NO BRACKETS ANYWHERE. The rewrite hands the upstream path over as an
// ordinary query parameter instead, and this is a plain, boring filename that
// any file scan will find.
//
// ── NOT AN OPEN PROXY ────────────────────────────────────────────────────
//
// GET only, and only paths under `api/v3/`. Without that second check this
// endpoint would forward arbitrary paths to any CoinGecko route on our IP
// reputation and our key.

export const config = { runtime: 'edge' };

const UPSTREAM = 'https://api.coingecko.com';
const ALLOWED_PREFIX = 'api/v3/';

/** The query key `vercel.json` hands the upstream path over in. Stripped
 *  before forwarding — CoinGecko has no idea what it is. */
const PATH_PARAM = 'path';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  // Leading slashes trimmed so `/cg/api/v3/ping` and `cg/api/v3/ping` land in
  // the same place; the rewrite produces the first form.
  const path = (url.searchParams.get(PATH_PARAM) ?? '').replace(/^\/+/, '');

  if (!path.startsWith(ALLOWED_PREFIX)) {
    return new Response('Not Found', { status: 404 });
  }

  const target = new URL(`${UPSTREAM}/${path}`);
  url.searchParams.forEach((value, key) => {
    if (key === PATH_PARAM) return;
    target.searchParams.append(key, value);
  });

  const key = process.env.COINGECKO_DEMO_KEY;
  if (key) target.searchParams.set('x_cg_demo_api_key', key);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { accept: 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'coingecko unreachable' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      // Deliberately reports the key's PRESENCE, never its value. A missing
      // env var otherwise looks identical to the original IP block — the same
      // 403 — and this suite has already lost time to a misconfiguration that
      // was indistinguishable from the bug it was meant to fix. It is also
      // how the silent-skip above was caught: no header at all means the
      // handler never ran, which is a third failure mode again.
      'x-cg-proxy-key': key ? 'present' : 'absent',
      // The client keeps its own cache and rate gate; this is only here so a
      // burst of identical calls does not each become an upstream request.
      'cache-control': 'public, max-age=60, s-maxage=60',
    },
  });
}
