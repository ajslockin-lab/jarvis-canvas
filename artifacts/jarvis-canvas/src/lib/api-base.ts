// api-base.ts -- Resolved API base URL for direct fetch() calls.
//
// Many pages call `fetch("/api/auth/signup", ...)` instead of going through
// the generated api-client. Those run same-origin ("/api/..."): vercel.json
// rewrites "/api/*" to the api-server in prod, and vite.config.ts proxies
// "/api" to localhost:8080 in dev. Same-origin avoids cross-origin preflight,
// which HF Spaces' front proxy answers without Access-Control-Allow-
// Credentials — a header the browser requires for credentialed (cookie)
// fetches. Empty API_BASE = relative paths here AND in the generated client
// (main.tsx skips setBaseUrl when this is empty). VITE_API_URL is ignored on
// purpose so a stale cross-origin value on the host can't reintroduce the bug.
//
// To point the frontend at a different backend, change the rewrite target in
// vercel.json (prod) and server.proxy in vite.config.ts (dev) — single source
// of truth lives there now, not in client code.

export const API_BASE: string = "";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
