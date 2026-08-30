/* Pre-paint theme resolution (v1.11).
 *
 * Must run before the stylesheet paints, or a supporter on the Rack theme
 * sees one frame of the free instrument palette on every cold start. A
 * type="module" script is deferred, so main.tsx is far too late.
 *
 * This lives in public/ as a real file rather than inline in index.html for a
 * specific reason: NCC ships a strict CSP with `script-src 'self'`, which
 * blocks inline execution outright. The alternatives were weakening the policy
 * with 'unsafe-inline' — trading a deliberate security control for a cosmetic
 * feature — or pinning a sha256 hash that silently breaks the moment anyone
 * edits a character of this file. A same-origin script satisfies 'self' and
 * needs neither.
 *
 * Deliberately dependency-free and total: any throw, any malformed value, any
 * absent entitlement all land on the free theme, which is the correct fallback
 * rather than an error state. Mirrors the storage keys in src/lib/theme.ts and
 * src/lib/entitlement.ts.
 */
(function () {
  try {
    if (localStorage.getItem('nexus.theme') !== 'rack') return;
    var e = JSON.parse(localStorage.getItem('nexus.entitlement') || 'null');
    if (!e || !e.expiresAt) return;
    if (!(Date.parse(e.expiresAt) > Date.now())) return;
    document.documentElement.setAttribute('data-theme', 'rack');
  } catch (err) {
    /* free theme */
  }
})();
