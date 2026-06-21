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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "AI not configured (GEMINI_API_KEY secret not set)" }, 503);

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
