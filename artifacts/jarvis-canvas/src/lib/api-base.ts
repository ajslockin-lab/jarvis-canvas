// api-base.ts -- Resolved API base URL for direct fetch() calls.
//
// Many pages call `fetch("/api/auth/signup", ...)` instead of going through
// the generated api-client. For those, the URL needs an explicit origin so
// deployed builds reach the api-server instead of Vercel's catch-all rewrite.
//
// Same resolution rule as main.tsx: prefer a hardcoded constant for the
// deployed deploy, fall back to the env var, fall back to same-origin.
// Keeping it in one module guarantees the two paths stay in sync.

const HARDCODED_API = "https://Ssatgk-carvis-api.hf.space";

export const API_BASE: string = (
  HARDCODED_API ||
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ||
  ""
).replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
