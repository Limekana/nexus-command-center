// CoinGecko proxy for the web edition — WEB-1.
//
// THE BUG THIS FIXES
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
// NOT AN OPEN PROXY: only GET, and only paths under `api/v3/`. Without that
// second check this endpoint would forward arbitrary paths to any CoinGecko
// route on our IP reputation and our key.

export const config = { runtime: 'edge' };

const UPSTREAM = 'https://api.coingecko.com';
const ALLOWED_PREFIX = 'api/v3/';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  // The rewrite maps /cg/<rest> -> /api/cg/<rest>, so strip our own mount
  // point back off to recover the upstream path.
  const path = url.pathname.replace(/^\/api\/cg\//, '');

  if (!path.startsWith(ALLOWED_PREFIX)) {
    return new Response('Not Found', { status: 404 });
  }

  const target = new URL(`${UPSTREAM}/${path}`);
  url.searchParams.forEach((value, key) => target.searchParams.append(key, value));

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
      // was indistinguishable from the bug it was meant to fix.
      'x-cg-proxy-key': key ? 'present' : 'absent',
      // The client keeps its own cache and rate gate; this is only here so a
      // burst of identical calls does not each become an upstream request.
      'cache-control': 'public, max-age=60, s-maxage=60',
    },
  });
}
