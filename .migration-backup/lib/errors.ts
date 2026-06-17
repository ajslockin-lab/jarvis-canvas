import { NextResponse } from "next/server";

export interface ApiError {
  error: string;
  code: string;
}

const ERROR_CODES = {
  UNAUTHORIZED: { error: "You must be signed in", code: "UNAUTHORIZED", status: 401 },
  FORBIDDEN: { error: "You do not have permission", code: "FORBIDDEN", status: 403 },
  NOT_FOUND: { error: "Resource not found", code: "NOT_FOUND", status: 404 },
  VALIDATION: { error: "Invalid input", code: "VALIDATION", status: 422 },
  CANVAS_AUTH: { error: "Canvas connection required", code: "CANVAS_AUTH", status: 403 },
  CANVAS_API: { error: "Canvas API error", code: "CANVAS_API", status: 502 },
  INTERNAL: { error: "Internal server error", code: "INTERNAL", status: 500 },
} as const;

type ErrorKey = keyof typeof ERROR_CODES;

export function apiError(
  key: ErrorKey,
  overrides?: { error?: string; code?: string }
): NextResponse<ApiError> {
  const base = ERROR_CODES[key];
  return NextResponse.json(
    {
      error: overrides?.error ?? base.error,
      code: overrides?.code ?? base.code,
    },
    { status: base.status }
  );
}

/**
 * Canvas API call with retry + token-refresh awareness.
 * Returns parsed JSON or throws on terminal failure.
 */
export async function canvasFetch<T>(
  url: string,
  token: string,
  options?: { method?: string; body?: unknown; maxRetries?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: options?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(options?.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      if (res.status === 401) throw new Error("CANVAS_TOKEN_EXPIRED");
      if (res.status === 403) throw new Error("CANVAS_FORBIDDEN");
      if (res.status === 404) throw new Error("CANVAS_NOT_FOUND");
      if (res.status >= 500) {
        lastError = new Error(`Canvas ${res.status}: server error (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      if (!res.ok) throw new Error(`Canvas ${res.status}: ${await res.text()}`);

      return (await res.json()) as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "CANVAS_TOKEN_EXPIRED" || message === "CANVAS_FORBIDDEN" || message === "CANVAS_NOT_FOUND") {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(message);
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error("Canvas API request failed after retries");
}
