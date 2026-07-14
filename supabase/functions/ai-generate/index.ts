// Limecore suite — server-side Gemini proxy. v1.4.
//
// DEPLOYED to Supabase project hkktorzhaqnfqsnlstda as edge function
// `ai-generate` (verify_jwt = true). This file is the version-controlled copy;
// deploy via the Supabase MCP / `supabase functions deploy ai-generate`.
//
// On-device Gemini Nano is unavailable on the S24 (ML Kit GenAI features
// FEATURE_NOT_FOUND — see the AI-1 registry blocker), so the suite's AI
// features route through this function instead. The Gemini API key lives ONLY
// here as the GEMINI_API_KEY secret — never in the app bundle. Auth-gated:
// only signed-in suite users can call it. The prompt is NOT logged (privacy).
//
// Request  (POST JSON): { prompt: string, maxTokens?: number, temperature?: number, json?: boolean }
// Response (200 JSON):   { text: string }
// Errors:                { error: string, detail?/reason? } with an appropriate status.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function clampNum(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === "number" && isFinite(v) ? v : def;
  return Math.min(hi, Math.max(lo, n));
}
function clampInt(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === "number" && isFinite(v) ? Math.round(v) : def;
  return Math.min(hi, Math.max(lo, n));
}

// ---------------------------------------------------------------------------
// Rate limiting.
//
// verify_jwt = true means the Supabase gateway has already checked the
// caller's signature before we run, but the gateway does not itself throttle
// call volume. Without a limit here, any authenticated user (or anyone
// holding a leaked JWT) could loop this function unboundedly, and every call
// hits the Gemini API on our server-side GEMINI_API_KEY — uncapped billing
// exposure. These two limits are a first layer against that: a per-user
// sliding window, plus a global cap shared across all callers.
//
// HONEST LIMITATION: this state is a plain in-memory Map, so it only holds
// for the lifetime of one isolate. Supabase Edge Functions can spin up
// multiple isolates (cold starts, concurrent load, geographic routing), so
// the "global" cap below is really per-isolate, not process-wide across the
// whole deployment — a caller landing on several isolates could exceed the
// nominal 120/hour. For this app (personal suite, ~2 real users, occasional
// AI debriefs/narratives) that's an acceptable first layer. If this ever
// needs to be airtight, the escalation path is a durable Postgres-backed
// limiter (a counters table) instead of in-memory state.
// ---------------------------------------------------------------------------

const USER_WINDOW_MS = 60_000; // 60s sliding window
const USER_LIMIT = 10; // ...max 10 requests per user in that window
const GLOBAL_WINDOW_MS = 60 * 60_000; // 1h sliding window
const GLOBAL_LIMIT = 120; // ...max 120 requests total, across all users
const GLOBAL_KEY = "__global__";

// key -> recent request timestamps (ms). Pruned lazily on each lookup.
const requestLog = new Map<string, number[]>();

// Prunes `key`'s bucket to only timestamps within `windowMs` of `now`. If the
// pruned count is already at `limit`, the request is rejected and NOT
// recorded (it didn't happen, as far as the window is concerned). Otherwise
// `now` is appended and the request is allowed.
function checkAndRecord(key: string, windowMs: number, limit: number, now: number): boolean {
  const recent = (requestLog.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    requestLog.set(key, recent);
    return false;
  }
  recent.push(now);
  requestLog.set(key, recent);
  return true;
}

// The gateway already verified this JWT's signature (verify_jwt = true), so
// it's safe to just decode the payload locally to bucket requests per-user —
// no need to pull in a JWT library or re-verify anything. If the header is
// missing or the payload can't be parsed, every such caller shares one
// "anon" bucket: still rate-limited, never bypassed.
function getUserIdFromAuthHeader(req: Request): string {
  const auth = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return "anon";
  try {
    const payloadSeg = token.split(".")[1];
    const b64 = payloadSeg.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.sub === "string" && payload.sub ? payload.sub : "anon";
  } catch {
    return "anon";
  }
}

// 429 with a Retry-After header — json() doesn't carry extra headers, so this
// builds the response inline for this one case rather than extending it.
function rateLimited(windowMs: number): Response {
  const retryAfter = Math.ceil(windowMs / 1000);
  return new Response(JSON.stringify({ error: "rate limited", retryAfter }), {
    status: 429,
    headers: { ...CORS, "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "AI not configured (GEMINI_API_KEY secret not set)" }, 503);

  // Rate limit BEFORE any upstream call: per-user window first, then the
  // global cap. Checked in this order so a request already rejected for the
  // user never also consumes a slot in the global bucket.
  const now = Date.now();
  const userId = getUserIdFromAuthHeader(req);
  if (!checkAndRecord(`user:${userId}`, USER_WINDOW_MS, USER_LIMIT, now)) {
    return rateLimited(USER_WINDOW_MS);
  }
  if (!checkAndRecord(GLOBAL_KEY, GLOBAL_WINDOW_MS, GLOBAL_LIMIT, now)) {
    return rateLimited(GLOBAL_WINDOW_MS);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return json({ error: "prompt is required" }, 400);
  if (prompt.length > 8000) return json({ error: "prompt too long (max 8000 chars)" }, 400);

  const temperature = clampNum(body.temperature, 0, 2, 0.6);
  const maxOutputTokens = clampInt(body.maxTokens, 1, 1024, 256);
  const wantJson = body.json === true;

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens,
    // Gemini 2.5 models "think" by default, and that reasoning is billed
    // against maxOutputTokens — a small cap can be fully consumed by thinking,
    // returning just a few visible words. These are short narrative/extraction
    // tasks, so disable thinking for fast, complete responses.
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (wantJson) generationConfig.responseMimeType = "application/json";

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
  } catch (e) {
    return json({ error: "upstream fetch failed: " + (e as Error).message }, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text();
    // Never echo the key; cap detail length.
    return json(
      { error: `Gemini ${resp.status}`, detail: detail.slice(0, 500) },
      resp.status === 429 ? 429 : 502,
    );
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: { text?: string }) => p?.text ?? "").join("").trim()
    : "";
  if (!text) {
    const reason =
      data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? "empty";
    return json({ error: "no text returned", reason }, 502);
  }

  return json({ text });
});
