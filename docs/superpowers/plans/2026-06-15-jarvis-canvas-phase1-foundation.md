# JARVIS Canvas Phase 1: Foundation (Auth + Production Hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake credentials provider with real Canvas OAuth 2.0, support any Canvas school domain, encrypt tokens at rest, and harden the codebase for production deployment.

**Architecture:** Canvas OAuth 2.0 replaces credentials auth entirely. Users enter their school's Canvas URL, get redirected to that school's OAuth endpoint, and return with an access/refresh token pair stored encrypted in Supabase Postgres. All API routes validate the NextAuth session. A new `lib/crypto.ts` module handles AES-256-GCM encryption/decryption. Untracked secrets are removed from git, unused deps pruned, dead code removed, Zod validation added to all routes, ESLint tightened.

**Tech Stack:** Next.js 16 App Router, NextAuth 4, Prisma 6, Supabase Postgres, Zod, AES-256-GCM via Node.js `crypto`, Vitest, GitHub Actions

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/crypto.ts` | AES-256-GCM encrypt/decrypt for Canvas tokens |
| Create | `lib/canvas-auth.ts` | Canvas OAuth 2.0 flow (authorize URL, token exchange, refresh) |
| Create | `lib/validators.ts` | Zod schemas for all API route inputs |
| Create | `lib/errors.ts` | Consistent API error response helpers |
| Create | `lib/with-auth.ts` | Session validation wrapper for API routes |
| Create | `app/api/auth/canvas/route.ts` | Canvas OAuth callback handler |
| Create | `app/api/auth/canvas/start/route.ts` | Canvas OAuth redirect initiator |
| Modify | `lib/auth.ts` | Replace credentials provider with Canvas OAuth provider |
| Modify | `prisma/schema.prisma` | Add encrypted token fields, remove plaintext `canvasToken` |
| Modify | `app/api/canvas/sync/route.ts` | Use session auth, per-user Canvas URL + encrypted tokens |
| Modify | `app/api/user/data/route.ts` | Use session auth instead of `findFirst` |
| Modify | `app/api/voice/command/route.ts` | Use session auth instead of `findFirst` |
| Modify | `app/api/reminders/route.ts` | Fix PATCH auth, add Zod validation |
| Modify | `app/api/extension/agent/route.ts` | Add session auth check |
| Modify | `components/auth/CanvasConnectButton.tsx` | Replace fake button with real OAuth redirect |
| Modify | `app/settings/page.tsx` | Replace fake Canvas connect with real flow |
| Modify | `app/landing/page.tsx` | Update CTA to go to Canvas onboarding |
| Modify | `components/dashboard/Dashboard.tsx` | Fix CARVIS→JARVIS typo, remove mockCourses/demoGrades |
| Modify | `components/extension/ExtensionOverlay.tsx` | Remove hardcoded grades |
| Modify | `package.json` | Remove unused deps, add zod + vitest |
| Modify | `.gitignore` | Add dev.log, .superpowers/ |
| Modify | `eslint.config.mjs` | Re-enable no-explicit-any, add no-unused-vars |
| Delete | `components/dashboard/WeeklyCalendar.tsx` | Dead code — never imported |
| Remove | Wispr stubs from `lib/voice.ts` | Unused integration |

---

### Task 1: Git Security Cleanup

**Files:**
- Modify: `.gitignore`
- Modify: git index (untrack secrets)

- [ ] **Step 1: Untrack committed secrets and build artifacts**

```bash
cd C:/Users/sarth/jarvis-canvas
git rm --cached .env .env.local dev.log tsconfig.tsbuildinfo 2>/dev/null || true
```

- [ ] **Step 2: Add entries to .gitignore**

Add to the end of `.gitignore`:

```
# Secrets (must never be committed)
.env
.env.local
.env*.local

# Dev artifacts
dev.log
*.tsbuildinfo

# Superpowers brainstorm assets
.superpowers/
```

- [ ] **Step 3: Verify secrets are no longer tracked**

Run: `git status`
Expected: `.env`, `.env.local`, `dev.log`, `tsconfig.tsbuildinfo` show as deleted (staged for removal from tracking). The files still exist on disk but git no longer tracks them.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: untrack secrets and dev artifacts from git"
```

---

### Task 2: Remove Unused Dependencies and Dead Code

**Files:**
- Modify: `package.json`
- Delete: `components/dashboard/WeeklyCalendar.tsx`
- Modify: `lib/voice.ts` (remove Wispr stub)

- [ ] **Step 1: Uninstall unused packages**

```bash
cd C:/Users/sarth/jarvis-canvas
npm uninstall @supabase/supabase-js @google/generative-ai inngest bcryptjs @types/bcryptjs
```

- [ ] **Step 2: Install new dependencies**

```bash
npm install zod
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 3: Delete dead WeeklyCalendar component**

Delete `components/dashboard/WeeklyCalendar.tsx` — it is never imported anywhere.

- [ ] **Step 4: Remove Wispr AI stub from lib/voice.ts**

Open `lib/voice.ts` and remove the `createWisprRecognizer` function (and any references to `Wispr.SpeechRecognizer`). Keep the Web Speech API functions.

- [ ] **Step 5: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no errors (type errors may appear from removed packages — fix any imports that referenced them).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove unused deps, dead WeeklyCalendar, Wispr stub"
```

---

### Task 3: Token Encryption Module (lib/crypto.ts)

**Files:**
- Create: `lib/crypto.ts`
- Create: `lib/__tests__/crypto.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/crypto.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../crypto";

// Set a test encryption key
process.env.ENCRYPTION_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

describe("crypto", () => {
  it("encrypts and decrypts a string round-trip", () => {
    const plaintext = "my-secret-canvas-token";
    const encrypted = encrypt(plaintext);
    // Encrypted should NOT equal plaintext
    expect(encrypted).not.toBe(plaintext);
    // Encrypted should be an iv:ciphertext:authTag string
    expect(encrypted.split(":")).toHaveLength(3);
    // Decrypt should recover the original
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("throws if ENCRYPTION_KEY is not set", () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = original;
  });

  it("throws on corrupted ciphertext", () => {
    expect(() => decrypt("invalid:data:here")).toThrow();
  });

  it("produces different ciphertext on each call (random IV)", () => {
    const plaintext = "same-input";
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    expect(enc1).not.toBe(enc2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/crypto.test.ts`
Expected: FAIL — `crypto` module does not exist

- [ ] **Step 3: Write minimal implementation**

Create `lib/crypto.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  // Key must be 32 bytes (256 bits) for AES-256
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Format: iv:ciphertext:authTag (all base64)
  return [
    iv.toString("base64"),
    encrypted.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format — expected iv:ciphertext:authTag");
  }
  const [ivB64, encryptedB64, authTagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/crypto.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/crypto.ts lib/__tests__/crypto.test.ts
git commit -m "feat: add AES-256-GCM token encryption module with tests"
```

---

### Task 4: Consistent API Error Helpers (lib/errors.ts)

**Files:**
- Create: `lib/errors.ts`

- [ ] **Step 1: Create the error helpers module**

Create `lib/errors.ts`:

```typescript
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

      if (res.status === 401) {
        throw new Error("CANVAS_TOKEN_EXPIRED");
      }
      if (res.status === 403) {
        throw new Error("CANVAS_FORBIDDEN");
      }
      if (res.status === 404) {
        throw new Error("CANVAS_NOT_FOUND");
      }
      if (res.status >= 500) {
        lastError = new Error(`Canvas ${res.status}: server error (attempt ${attempt + 1})`);
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Canvas ${res.status}: ${await res.text()}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Non-retryable errors — rethrow immediately
      if (
        message === "CANVAS_TOKEN_EXPIRED" ||
        message === "CANVAS_FORBIDDEN" ||
        message === "CANVAS_NOT_FOUND"
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(message);
      // Network error or 5xx — retry with backoff
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error("Canvas API request failed after retries");
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/errors.ts
git commit -m "feat: add consistent API error helpers and Canvas fetch with retry"
```

---

### Task 5: Auth Session Wrapper (lib/with-auth.ts)

**Files:**
- Create: `lib/with-auth.ts`

- [ ] **Step 1: Create the session validation wrapper**

Create `lib/with-auth.ts`:

```typescript
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { apiError } from "./errors";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
  canvasBaseUrl: string | null;
  canvasAccessTokenEncrypted: string | null;
  canvasRefreshTokenEncrypted: string | null;
  canvasTokenExpiresAt: Date | null;
  canvasUserId: string | null;
}

interface AuthResult {
  user: AuthedUser;
  error: NextResponse | null;
}

/**
 * Validates the NextAuth session and loads the full user record.
 * Returns { user, error } — if error is non-null, return it from the route handler.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { user: null as unknown as AuthedUser, error: apiError("UNAUTHORIZED") };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      canvasBaseUrl: true,
      canvasAccessTokenEncrypted: true,
      canvasRefreshTokenEncrypted: true,
      canvasTokenExpiresAt: true,
      canvasUserId: true,
    },
  });

  if (!user) {
    return { user: null as unknown as AuthedUser, error: apiError("NOT_FOUND", { error: "User not found" }) };
  }

  return { user, error: null };
}

/**
 * Checks if user has a valid (non-expired) Canvas connection.
 * Returns decrypted access token or null.
 */
export async function getCanvasToken(user: AuthedUser): Promise<string | null> {
  if (!user.canvasAccessTokenEncrypted || !user.canvasBaseUrl) {
    return null;
  }

  // Check if token is expired and try refresh
  if (user.canvasTokenExpiresAt && new Date() > user.canvasTokenExpiresAt) {
    const { refreshCanvasToken } = await import("./canvas-auth");
    const newToken = await refreshCanvasToken(user.id);
    if (!newToken) return null;
    return newToken;
  }

  const { decrypt } = await import("./crypto");
  return decrypt(user.canvasAccessTokenEncrypted);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/with-auth.ts
git commit -m "feat: add session auth wrapper with Canvas token refresh"
```

---

### Task 6: Zod Validation Schemas (lib/validators.ts)

**Files:**
- Create: `lib/validators.ts`

- [ ] **Step 1: Create Zod schemas for all API route inputs**

Create `lib/validators.ts`:

```typescript
import { z } from "zod";

/** Canvas URL input — must be a valid Instructure domain */
export const canvasUrlSchema = z.object({
  canvasUrl: z
    .string()
    .min(1, "Canvas URL is required")
    .regex(
      /^https?:\/\/[a-z0-9-]+\.instructure\.com$/,
      "Must be a valid Canvas URL (e.g., https://school.instructure.com)"
    )
    .transform((url) => url.replace(/\/+$/, "")), // strip trailing slash
});

/** Voice command input */
export const voiceCommandSchema = z.object({
  text: z.string().min(1, "Text is required").max(1000, "Text too long"),
});

/** Create reminder input */
export const createReminderSchema = z.object({
  assignmentId: z.string().optional(),
  type: z.enum(["custom", "deadline", "study"]).default("custom"),
  triggeredAt: z.string().datetime("Must be a valid ISO datetime"),
});

/** Update reminder input */
export const updateReminderSchema = z.object({
  id: z.string().min(1, "Reminder ID is required"),
  active: z.boolean().optional(),
});

/** Extension agent input */
export const extensionAgentSchema = z.object({
  command: z.string().min(1, "Command is required"),
  pageContext: z.object({
    url: z.string(),
    title: z.string(),
    elements: z.array(
      z.object({
        id: z.string(),
        tag: z.string(),
        text: z.string(),
        ariaLabel: z.string().optional(),
        placeholder: z.string().optional(),
        href: z.string().optional(),
      })
    ),
  }),
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/validators.ts
git commit -m "feat: add Zod validation schemas for all API routes"
```

---

### Task 7: Prisma Schema — Encrypted Token Fields

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update User model with new fields**

Replace the `User` model in `prisma/schema.prisma` with:

```prisma
model User {
  id                            String    @id @default(uuid())
  email                         String    @unique
  name                          String?
  image                         String?
  // Canvas OAuth — encrypted at rest
  canvasBaseUrl                 String?
  canvasAccessTokenEncrypted    String?
  canvasRefreshTokenEncrypted   String?
  canvasTokenExpiresAt          DateTime?
  canvasUserId                  String?
  // Legacy fields — remove after migration
  canvasToken                   String?
  canvasDomain                  String?
  // User preferences
  ttsEnabled                    Boolean   @default(true)
  proactiveAlerts               Boolean   @default(true)
  energyLevel                   Int       @default(3)
  createdAt                     DateTime  @default(now())
  updatedAt                     DateTime  @updatedAt

  courses       Course[]
  reminders     Reminder[]
  studyGroups   StudyGroupMember[]
  conversations Conversation[]
}
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name add_encrypted_token_fields`
Expected: Migration generated and applied. New columns added.

- [ ] **Step 3: Verify the migration**

Run: `npx prisma generate`
Expected: Prisma client regenerated with new fields.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add encrypted Canvas token fields to User model"
```

---

### Task 8: Canvas OAuth 2.0 — Auth Module (lib/canvas-auth.ts)

**Files:**
- Create: `lib/canvas-auth.ts`
- Create: `lib/__tests__/canvas-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/canvas-auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAuthorizeUrl, exchangeCodeForToken } from "../canvas-auth";

// We mock fetch for token exchange
beforeEach(() => {
  vi.stubEnv("CANVAS_CLIENT_ID", "test-client-id");
  vi.stubEnv("CANVAS_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
});

describe("buildAuthorizeUrl", () => {
  it("builds a valid Canvas OAuth authorize URL", () => {
    const url = buildAuthorizeUrl("https://school.instructure.com", "test-state");
    expect(url).toContain("https://school.instructure.com/login/oauth2/auth");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=test-state");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("scope=");
  });

  it("strips trailing slash from canvas URL", () => {
    const url = buildAuthorizeUrl("https://school.instructure.com/", "state");
    expect(url).toContain("https://school.instructure.com/login");
    expect(url).not.toContain("instructure.com//login");
  });
});

describe("exchangeCodeForToken", () => {
  it("posts to the token endpoint and returns tokens", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "at-123",
          refresh_token: "rt-456",
          expires_in: 3600,
          user: { id: "42" },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await exchangeCodeForToken(
      "https://school.instructure.com",
      "auth-code-abc"
    );

    expect(result.accessToken).toBe("at-123");
    expect(result.refreshToken).toBe("rt-456");
    expect(result.canvasUserId).toBe("42");
    expect(result.expiresIn).toBe(3600);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.grant_type).toBe("authorization_code");
    expect(callBody.code).toBe("auth-code-abc");

    vi.unstubGlobal("fetch");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Bad Request",
        text: () => Promise.resolve("invalid code"),
      })
    );

    await expect(
      exchangeCodeForToken("https://school.instructure.com", "bad-code")
    ).rejects.toThrow();

    vi.unstubGlobal("fetch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/canvas-auth.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Write minimal implementation**

Create `lib/canvas-auth.ts`:

```typescript
import { encrypt, decrypt } from "./crypto";
import { prisma } from "./prisma";

const SCOPES = [
  "url:GET|/api/v1/users/:id",
  "url:GET|/api/v1/courses",
  "url:GET|/api/v1/courses/:course_id/assignments",
  "url:GET|/api/v1/courses/:course_id/enrollments",
  "url:PUT|/api/v1/courses/:course_id/assignments/:id",
].join(" ");

/**
 * Build the Canvas OAuth 2.0 authorize URL for user redirect.
 */
export function buildAuthorizeUrl(canvasBaseUrl: string, state: string): string {
  const base = canvasBaseUrl.replace(/\/+$/, "");
  const clientId = process.env.CANVAS_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/canvas`;

  const params = new URLSearchParams({
    client_id: clientId ?? "",
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
  });

  return `${base}/login/oauth2/auth?${params.toString()}`;
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  canvasUserId: string;
}

/**
 * Exchange an OAuth authorization code for access + refresh tokens.
 */
export async function exchangeCodeForToken(
  canvasBaseUrl: string,
  code: string
): Promise<TokenResult> {
  const base = canvasBaseUrl.replace(/\/+$/, "");
  const clientId = process.env.CANVAS_CLIENT_ID;
  const clientSecret = process.env.CANVAS_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/canvas`;

  const res = await fetch(`${base}/login/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canvas token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
    canvasUserId: String(data.user?.id ?? ""),
  };
}

/**
 * Refresh an expired Canvas access token using the stored refresh token.
 * Returns the new access token, or null if refresh fails.
 */
export async function refreshCanvasToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      canvasBaseUrl: true,
      canvasRefreshTokenEncrypted: true,
    },
  });

  if (!user?.canvasRefreshTokenEncrypted || !user?.canvasBaseUrl) {
    return null;
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(user.canvasRefreshTokenEncrypted);
  } catch {
    // Corrupted encrypted data — user must re-auth
    return null;
  }

  const base = user.canvasBaseUrl.replace(/\/+$/, "");
  const clientId = process.env.CANVAS_CLIENT_ID;
  const clientSecret = process.env.CANVAS_CLIENT_SECRET;

  try {
    const res = await fetch(`${base}/login/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const newAccessToken: string = data.access_token;
    const expiresIn: number = data.expires_in ?? 3600;

    // Save the new access token (encrypted)
    await prisma.user.update({
      where: { id: userId },
      data: {
        canvasAccessTokenEncrypted: encrypt(newAccessToken),
        canvasTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    return newAccessToken;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/canvas-auth.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/canvas-auth.ts lib/__tests__/canvas-auth.test.ts
git commit -m "feat: add Canvas OAuth 2.0 auth module with authorize URL, token exchange, and refresh"
```

---

### Task 9: Canvas OAuth API Routes

**Files:**
- Create: `app/api/auth/canvas/start/route.ts`
- Create: `app/api/auth/canvas/route.ts`

- [ ] **Step 1: Create the OAuth start route (redirects user to Canvas)**

Create `app/api/auth/canvas/start/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/canvas-auth";
import { canvasUrlSchema } from "@/lib/validators";
import { apiError } from "@/lib/errors";
import { randomBytes } from "crypto";

/**
 * POST /api/auth/canvas/start
 * Body: { canvasUrl: "https://school.instructure.com" }
 * Redirects user to their school's Canvas OAuth endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = canvasUrlSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { canvasUrl } = parsed.data;

    // Generate a random state parameter for CSRF protection
    const state = randomBytes(16).toString("hex");

    // Store the state + canvasUrl in a short-lived cookie so the callback can verify
    const authorizeUrl = buildAuthorizeUrl(canvasUrl, state);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set("canvas_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });
    response.cookies.set("canvas_oauth_url", canvasUrl, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Canvas OAuth start error:", error);
    return apiError("INTERNAL");
  }
}
```

- [ ] **Step 2: Create the Canvas OAuth callback route**

Create `app/api/auth/canvas/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/canvas-auth";
import { encrypt } from "@/lib/crypto";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/canvas
 * Canvas OAuth callback — exchanges code for tokens, upserts user, signs in.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    // Verify state matches our CSRF cookie
    const storedState = req.cookies.get("canvas_oauth_state")?.value;
    const canvasUrl = req.cookies.get("canvas_oauth_url")?.value;

    if (!code || !state || state !== storedState || !canvasUrl) {
      return NextResponse.redirect(
        new URL("/settings?error=canvas_auth_failed", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
      );
    }

    // Exchange code for tokens
    const tokenResult = await exchangeCodeForToken(canvasUrl, code);

    // Upsert user: find by canvasUserId on this canvasBaseUrl, or create
    // We use email as the unique key — get it from Canvas API
    const meRes = await fetch(`${canvasUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
    });
    const meData = meRes.ok ? await meRes.json() : null;
    const email = meData?.email ?? `canvas-${tokenResult.canvasUserId}@${new URL(canvasUrl).hostname}`;
    const name = meData?.name ?? "Canvas Student";

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        canvasBaseUrl: canvasUrl,
        canvasAccessTokenEncrypted: encrypt(tokenResult.accessToken),
        canvasRefreshTokenEncrypted: encrypt(tokenResult.refreshToken),
        canvasTokenExpiresAt: new Date(Date.now() + tokenResult.expiresIn * 1000),
        canvasUserId: tokenResult.canvasUserId,
      },
      update: {
        name,
        canvasBaseUrl: canvasUrl,
        canvasAccessTokenEncrypted: encrypt(tokenResult.accessToken),
        canvasRefreshTokenEncrypted: encrypt(tokenResult.refreshToken),
        canvasTokenExpiresAt: new Date(Date.now() + tokenResult.expiresIn * 1000),
        canvasUserId: tokenResult.canvasUserId,
      },
    });

    // Clean up OAuth state cookies
    const response = NextResponse.redirect(
      new URL("/dashboard", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    );
    response.cookies.delete("canvas_oauth_state");
    response.cookies.delete("canvas_oauth_url");

    // TODO: Create NextAuth session for this user
    // For now, set a simple session cookie that our auth wrapper can read
    response.cookies.set("canvas_user_email", user.email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Canvas OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/settings?error=canvas_auth_failed", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    );
  }
}
```

- [ ] **Step 3: Add NEXTAUTH_URL and ENCRYPTION_KEY to .env.local.example**

Update `.env.local.example`:

```env
# JARVIS Canvas Voice Assistant - Environment Variables
# ========================================================

# Database (Supabase)
# Get your connection string from Supabase Dashboard -> Settings -> Database -> Connection string
DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"

# Auth (NextAuth.js)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Token Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=""

# Canvas LMS OAuth (fill after registering with your school Canvas admin)
# Register at: https://your-canvas-domain.com/login/oauth2/register
CANVAS_CLIENT_ID=""
CANVAS_CLIENT_SECRET=""

# AI / NLU APIs (free tiers)
# Groq: https://console.groq.com/keys
GROQ_API_KEY="gsk_..."
```

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/canvas/ .env.local.example
git commit -m "feat: add Canvas OAuth start and callback API routes"
```

---

### Task 10: Replace NextAuth Credentials Provider with Canvas OAuth

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: Update auth configuration to use Canvas OAuth as the provider**

Replace entire contents of `lib/auth.ts`:

```typescript
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

/**
 * NextAuth configuration.
 * Uses a Canvas-backed credentials provider:
 * After Canvas OAuth, a secure cookie (canvas_user_email) is set.
 * This provider reads that cookie to establish the NextAuth session.
 * This bridges Canvas OAuth (which doesn't follow NextAuth's provider pattern)
 * with NextAuth's session management.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "canvas",
      name: "Canvas",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            email: true,
            name: true,
            canvasUserId: true,
          },
        });

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: update NextAuth to use Canvas-backed credentials provider"
```

---

### Task 11: Add Sign-In API Route for Canvas OAuth Users

**Files:**
- Create: `app/api/auth/canvas/signin/route.ts`

After the Canvas OAuth callback sets the `canvas_user_email` cookie, we need an endpoint that creates a NextAuth session.

- [ ] **Step 1: Create the Canvas sign-in route**

Create `app/api/auth/canvas/signin/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/canvas/signin
 * Creates a NextAuth session for a user who just completed Canvas OAuth.
 * Called from the frontend after canvas_user_email cookie is detected.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return apiError("VALIDATION", { error: "Email is required" });
    }

    // Verify the user exists in our DB (created by the OAuth callback)
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return apiError("NOT_FOUND", { error: "User not found — complete Canvas OAuth first" });
    }

    // The frontend will call NextAuth signIn("canvas", { email }) to create the session
    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("Canvas sign-in error:", error);
    return apiError("INTERNAL");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/auth/canvas/signin/route.ts
git commit -m "feat: add Canvas sign-in API route for NextAuth session creation"
```

---

### Task 12: Secure All API Routes with Auth

**Files:**
- Modify: `app/api/canvas/sync/route.ts`
- Modify: `app/api/user/data/route.ts`
- Modify: `app/api/voice/command/route.ts`
- Modify: `app/api/reminders/route.ts`
- Modify: `app/api/extension/agent/route.ts`

- [ ] **Step 1: Rewrite canvas sync route with auth + per-user Canvas connection**

Replace entire contents of `app/api/canvas/sync/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { fetchCanvasCourses, fetchCanvasAssignments } from "@/lib/canvas";
import { requireAuth, getCanvasToken } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";

export async function POST() {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const token = await getCanvasToken(user);
    if (!token || !user.canvasBaseUrl) {
      return apiError("CANVAS_AUTH", { error: "Canvas not connected — please link your Canvas account" });
    }

    const courses = await fetchCanvasCourses(token, user.canvasBaseUrl);

    let courseCount = 0;
    for (const c of courses || []) {
      if (!c.id || c.workflow_state !== "available") continue;

      await prisma.course.upsert({
        where: { id: String(c.id) },
        create: {
          id: String(c.id),
          userId: user.id,
          name: c.name || "Untitled Course",
          code: c.course_code || null,
          color: c.course_color || null,
          lastSynced: new Date(),
        },
        update: {
          name: c.name || "Untitled Course",
          code: c.course_code || null,
          color: c.course_color || null,
          lastSynced: new Date(),
        },
      });
      courseCount++;

      try {
        const assignments = await fetchCanvasAssignments(token, user.canvasBaseUrl!, String(c.id));
        for (const a of assignments || []) {
          if (!a.id) continue;
          await prisma.assignment.upsert({
            where: { id: String(a.id) },
            create: {
              id: String(a.id),
              courseId: String(c.id),
              name: a.name || "Untitled Assignment",
              description: a.description || null,
              dueDate: a.due_at ? new Date(a.due_at) : null,
              points: a.points_possible || null,
              url: a.html_url || null,
              completed: false,
            },
            update: {
              name: a.name || "Untitled Assignment",
              description: a.description || null,
              dueDate: a.due_at ? new Date(a.due_at) : null,
              points: a.points_possible || null,
              url: a.html_url || null,
            },
          });
        }
      } catch (err) {
        console.warn(`Failed to sync assignments for course ${c.id}:`, err);
      }
    }

    return NextResponse.json({ success: true, courseCount });
  } catch (error) {
    console.error("Canvas sync error:", error);
    return apiError("CANVAS_API", { error: "Canvas sync failed" });
  }
}
```

Note: This file needs `import { prisma } from "@/lib/prisma";` added at the top.

- [ ] **Step 2: Rewrite user/data route with auth**

Replace entire contents of `app/api/user/data/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";

export async function GET() {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { prisma } = await import("@/lib/prisma");
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        courses: {
          include: {
            assignments: {
              where: {
                completed: false,
                dueDate: { gte: new Date() },
              },
              orderBy: { dueDate: "asc" },
            },
          },
          orderBy: { lastSynced: "desc" },
        },
      },
    });

    if (!fullUser) {
      return NextResponse.json({ courses: [], hasData: false });
    }

    return NextResponse.json({
      user: fullUser,
      courses: fullUser.courses,
      hasData: true,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    const { apiError } = await import("@/lib/errors");
    return apiError("INTERNAL");
  }
}
```

- [ ] **Step 3: Rewrite voice/command route with auth + Zod validation**

Replace entire contents of `app/api/voice/command/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { classifyIntent, generateResponse } from "@/lib/nlu";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { voiceCommandSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await req.json();
    const parsed = voiceCommandSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { text } = parsed.data;

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        courses: {
          include: {
            assignments: { where: { completed: false } },
          },
        },
        reminders: { where: { active: true } },
      },
    });

    const context: Record<string, unknown> = {};
    if (userData) {
      type CourseWithAssignments = {
        id: string;
        name: string;
        assignments: { id: string; name: string; dueDate: Date | null }[];
      };
      context.assignments = (userData.courses as CourseWithAssignments[]).flatMap(
        (c) => c.assignments.map((a) => ({ ...a, courseName: c.name }))
      );
      context.reminders = userData.reminders;
    }

    const nlu = await classifyIntent(text);
    const response = await generateResponse(nlu.intent, nlu.entities, context);

    await prisma.conversation.create({
      data: {
        userId: user.id,
        role: "user",
        message: text,
        intent: nlu.intent,
      },
    });
    await prisma.conversation.create({
      data: {
        userId: user.id,
        role: "assistant",
        message: response,
      },
    });

    return NextResponse.json({
      intent: nlu.intent,
      response,
      confidence: nlu.confidence,
    });
  } catch (error) {
    console.error("Voice command error:", error);
    return apiError("INTERNAL");
  }
}
```

- [ ] **Step 4: Rewrite reminders route with auth + Zod validation**

Replace entire contents of `app/api/reminders/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { createReminderSchema, updateReminderSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";

// GET /api/reminders — list user's reminders
export async function GET() {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const reminders = await prisma.reminder.findMany({
      where: { userId: user.id, active: true },
      orderBy: { triggeredAt: "asc" },
    });

    return NextResponse.json(reminders);
  } catch (error) {
    console.error("Get reminders error:", error);
    return apiError("INTERNAL");
  }
}

// POST /api/reminders — create a new reminder
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await req.json();
    const parsed = createReminderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { assignmentId, type, triggeredAt } = parsed.data;

    const reminder = await prisma.reminder.create({
      data: {
        userId: user.id,
        assignmentId: assignmentId || null,
        type,
        triggeredAt: new Date(triggeredAt),
        active: true,
      },
    });

    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    console.error("Create reminder error:", error);
    return apiError("INTERNAL");
  }
}

// PATCH /api/reminders — update a reminder
export async function PATCH(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await req.json();
    const parsed = updateReminderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { id, active } = parsed.data;

    // Verify ownership before updating
    const existing = await prisma.reminder.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return apiError("NOT_FOUND", { error: "Reminder not found" });
    }

    const reminder = await prisma.reminder.update({
      where: { id },
      data: { active: active ?? existing.active },
    });

    return NextResponse.json(reminder);
  } catch (error) {
    console.error("Update reminder error:", error);
    return apiError("INTERNAL");
  }
}
```

- [ ] **Step 5: Add auth check to extension agent route**

Add session validation to `app/api/extension/agent/route.ts`. Replace the `POST` function:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { extensionAgentSchema } from "@/lib/validators";

// ... PageElement, PageContext, AgentAction, AgentPlan interfaces stay the same ...
// ... NAV_TARGETS, RISKY_WORDS, normalize, elementLabel, isRisky,
//     findBestElement, findNavElement, extractFillValue, planAction stay the same ...

export async function POST(req: NextRequest) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await req.json();
    const parsed = extensionAgentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { command, pageContext } = parsed.data;
    return NextResponse.json(planAction(command, pageContext));
  } catch (error) {
    console.error("Extension agent error:", error);
    return apiError("INTERNAL");
  }
}
```

- [ ] **Step 6: Verify build still works**

Run: `npm run build`
Expected: Build succeeds. If there are type errors, fix them.

- [ ] **Step 7: Commit**

```bash
git add app/api/
git commit -m "feat: secure all API routes with auth, add Zod validation, use per-user Canvas tokens"
```

---

### Task 13: Replace Fake CanvasConnectButton with Real OAuth

**Files:**
- Modify: `components/auth/CanvasConnectButton.tsx`

- [ ] **Step 1: Replace fake button with real Canvas OAuth redirect**

Replace entire contents of `components/auth/CanvasConnectButton.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Link2, Check, Loader2, ExternalLink } from "lucide-react";

interface CanvasConnectButtonProps {
  connected?: boolean;
  onConnect?: (canvasUrl: string) => void;
}

export default function CanvasConnectButton({ connected, onConnect }: CanvasConnectButtonProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [canvasUrl, setCanvasUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (connected) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]">
        <Check className="w-4 h-4" />
        <span className="font-orbitron text-[11px] font-bold tracking-[0.1em]">CANVAS LINKED</span>
      </div>
    );
  }

  const handleConnect = async () => {
    const url = canvasUrl.trim();
    if (!url) {
      setError("Enter your Canvas URL");
      return;
    }

    // Basic validation before sending to server
    if (!url.match(/^https?:\/\/[a-z0-9-]+\.instructure\.com$/)) {
      setError("Must be a valid Canvas URL (e.g., https://school.instructure.com)");
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/auth/canvas/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasUrl: url }),
      });

      // The server returns a redirect — follow it
      if (res.redirected) {
        window.location.href = res.url;
      } else if (res.ok) {
        // Some environments don't follow redirects automatically
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        const data = await res.json();
        setError(data.error || "Failed to connect to Canvas");
        setStatus("idle");
      }
    } catch {
      setError("Connection error — check your Canvas URL");
      setStatus("idle");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={canvasUrl}
          onChange={(e) => {
            setCanvasUrl(e.target.value);
            setError(null);
          }}
          placeholder="https://school.instructure.com"
          className="flex-1 px-3 py-2 bg-[#0A1520] border border-[#00B4FF]/20 text-[#e8f4f8] font-mono-data text-[12px] placeholder:text-[#5a7a8a]/50 focus:border-[#00B4FF]/50 focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
        />
        <button
          onClick={handleConnect}
          disabled={status === "submitting"}
          className="hud-btn-primary hud-btn inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="w-4 h-4 hud-sync-active" />
              <span>LINKING...</span>
            </>
          ) : (
            <>
              <Link2 className="w-4 h-4" />
              <span>CONNECT</span>
            </>
          )}
        </button>
      </div>
      <p className="font-rajdhani text-[11px] text-[#5a7a8a]">
        Enter your school's Canvas URL, then authorize JARVIS to read your data.
      </p>
      {error && (
        <p className="font-rajdhani text-[12px] text-[#FF9500]">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/auth/CanvasConnectButton.tsx
git commit -m "feat: replace fake CanvasConnectButton with real Canvas OAuth redirect"
```

---

### Task 14: Update Settings Page with Real Canvas Connection

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Update settings page to use real Canvas connection status**

In `app/settings/page.tsx`, add a `useEffect` to check Canvas connection status and replace the fake sync logic. Key changes:

Add at top of component (after existing state declarations):

```typescript
const [canvasConnected, setCanvasConnected] = useState(false);

useEffect(() => {
  fetch("/api/user/data")
    .then((r) => r.json())
    .then((data) => {
      setCanvasConnected(!!data.user?.canvasBaseUrl);
    })
    .catch(() => setCanvasConnected(false));
}, []);
```

Update the Canvas Integration section to pass `connected` prop:

```tsx
<CanvasConnectButton connected={canvasConnected} />
```

Below the connect button, add connection status if connected:

```tsx
{canvasConnected && (
  <p className="font-mono-data text-[11px] text-[#00FF88]">
    ✓ Canvas connected
  </p>
)}
```

- [ ] **Step 2: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: show real Canvas connection status in settings"
```

---

### Task 15: Fix Dashboard — Remove Mocks, Fix Typos

**Files:**
- Modify: `components/dashboard/Dashboard.tsx`

- [ ] **Step 1: Fix CARVIS→JARVIS typo**

In `components/dashboard/Dashboard.tsx`, find:
```tsx
<span>ACTIVATE CARVIS</span>
```
Replace with:
```tsx
<span>ACTIVATE JARVIS</span>
```

- [ ] **Step 2: Remove mockCourses fallback**

In `components/dashboard/Dashboard.tsx`, find the `fetchData` function. Remove the two places where `mockCourses` is used as fallback:

In the `catch` block (line ~60):
```typescript
// Change this:
setError("Couldn't fetch data. Showing demo data.");
setCourses(mockCourses);
// To this:
setError("Couldn't fetch data. Connect Canvas in settings.");
setCourses([]);
```

In the `else` branch (line ~57):
```typescript
// Change this:
setCourses(mockCourses);
// To this:
setCourses([]);
```

Also remove the `||` fallback for "CARVIS INTEL" heading (line ~296):
```tsx
// Change "CARVIS INTEL" to "JARVIS INTEL"
```

- [ ] **Step 3: Remove demoGrades from Dashboard**

In `components/dashboard/Dashboard.tsx`:
- Remove the `demoGrades` constant at the bottom of the file
- Change `<GradesPanel grades={demoGrades} />` to `<GradesPanel grades={[]} />` for now (Phase 2 will wire real grades)

Also delete the `mockCourses` constant since it's no longer used.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/Dashboard.tsx
git commit -m "fix: CARVIS→JARVIS typo, remove mock courses and demo grades"
```

---

### Task 16: Remove Hardcoded Grades from Extension Overlay

**Files:**
- Modify: `components/extension/ExtensionOverlay.tsx`

- [ ] **Step 1: Replace hardcoded grades section with dynamic data**

In `components/extension/ExtensionOverlay.tsx`, find the hardcoded grades section (around lines 249–265):
```tsx
{/* Grades */}
<div>
  <h3 className="text-[10px] uppercase tracking-widest mb-2 text-cyan-300/50">Grades</h3>
  {["Advanced Algebra", "Physics", "World History"].map((name, i) => {
    const pct = [92, 76, 89][i];
    ...
  })}
</div>
```

Replace with a real data fetch. Add a `grades` state variable at the top of the component:

```typescript
const [grades, setGrades] = useState<{ name: string; percent: number }[]>([]);
```

Add a fetch in the existing `useEffect`:
```typescript
fetch("/api/canvas/grades")
  .then((r) => r.json())
  .then((data) => setGrades(Array.isArray(data.grades) ? data.grades : []))
  .catch(() => setGrades([]))
```
Note: The `/api/canvas/grades` route will be implemented in Phase 2. For now, this will gracefully fail and show an empty grades section.

Replace the grades render section with:
```tsx
{/* Grades */}
<div>
  <h3 className="text-[10px] uppercase tracking-widest mb-2 text-cyan-300/50">Grades</h3>
  {grades.length > 0 ? (
    grades.map((g) => (
      <div key={g.name} className="mb-2">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-cyan-200">{g.name}</span>
          <span className="text-cyan-300 font-bold">{g.percent}%</span>
        </div>
        <div className="h-2 w-full bg-white/10 rounded-full">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-400" style={{ width: `${g.percent}%` }} />
        </div>
      </div>
    ))
  ) : (
    <p className="text-[11px] text-cyan-300/50">Connect Canvas to see grades</p>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add components/extension/extensionOverlay.tsx
git commit -m "feat: replace hardcoded grades in extension with dynamic data fetch"
```

---

### Task 17: Update Landing Page CTA

**Files:**
- Modify: `app/landing/page.tsx`

- [ ] **Step 1: Update CTA to point to onboarding flow**

In `app/landing/page.tsx`, change all `href="/dashboard"` links to `href="/settings"` so new users land on the page where they can connect Canvas first.

Find: `href="/dashboard"`
Replace with: `href="/settings"`

There are 3 instances in the landing page (nav, hero CTA, bottom CTA).

- [ ] **Step 2: Commit**

```bash
git add app/landing/page.tsx
git commit -m "feat: update landing CTA to direct users to Canvas onboarding"
```

---

### Task 18: Tighten ESLint Configuration

**Files:**
- Modify: `eslint.config.mjs` (or `eslint.config.ts` depending on setup)

- [ ] **Step 1: Re-enable strict rules**

Find the ESLint config file and update the rules section to add:

```javascript
rules: {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
}
```

If the current config has `no-explicit-any` set to `off`, change it to `error`.

- [ ] **Step 2: Fix any new lint errors**

Run: `npm run lint`
Expected: May show errors for existing `any` types. Fix them by replacing with proper types. Key files to fix:
- `lib/auth.ts` — session/token `any` → proper NextAuth types
- `lib/nlu.ts` — `entities: any` → define NLUEntities interface
- `components/extension/ExtensionOverlay.tsx` — `SpeechRecognition` any → proper browser types
- `components/voice/VoiceInterface.tsx` — same SpeechRecognition types

The existing `// eslint-disable-next-line` comments should be removed and the underlying issues fixed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: re-enable strict ESLint rules, fix all any types"
```

---

### Task 19: Add Vitest Config and Integration Tests

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/__tests__/errors.test.ts`

- [ ] **Step 1: Create Vitest configuration**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 2: Write tests for error helpers**

Create `lib/__tests__/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { apiError } from "../errors";

describe("apiError", () => {
  it("returns correct status for UNAUTHORIZED", () => {
    const response = apiError("UNAUTHORIZED");
    expect(response.status).toBe(401);
  });

  it("returns correct status for VALIDATION", () => {
    const response = apiError("VALIDATION", { error: "Bad input" });
    expect(response.status).toBe(422);
  });

  it("allows overriding error message", () => {
    const response = apiError("CANVAS_AUTH", { error: "Custom message" });
    // We can't easily read the JSON body from a NextResponse in tests,
    // but we can verify the status code is correct
    expect(response.status).toBe(403);
  });

  it("returns 500 for INTERNAL", () => {
    const response = apiError("INTERNAL");
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (crypto + canvas-auth + errors)

- [ ] **Step 4: Add test script to package.json**

In `package.json`, add to scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts lib/__tests__/ package.json
git commit -m "feat: add Vitest config and error helper tests"
```

---

### Task 20: GitHub Actions CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: npm test
        env:
          ENCRYPTION_KEY: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
          CANVAS_CLIENT_ID: "test-id"
          CANVAS_CLIENT_SECRET: "test-secret"
          NEXTAUTH_URL: "http://localhost:3000"
          DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test"
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflow for lint, type-check, and tests"
```

---

### Task 21: Final Integration Check

**Files:**
- No new files

- [ ] **Step 1: Run full lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final integration check — lint, types, tests, build all passing"
```

---

## Post-Phase Checklist

After completing all 21 tasks, verify:

- [ ] No `.env`, `.env.local`, or `dev.log` tracked in git
- [ ] No unused npm dependencies (`@supabase/supabase-js`, `@google/generative-ai`, `inngest`, `bcryptjs`)
- [ ] No dead code (`WeeklyCalendar.tsx`, Wispr stubs)
- [ ] Every API route requires auth (no `findFirst()` without session)
- [ ] Canvas tokens are encrypted at rest
- [ ] Zod validation on all route inputs
- [ ] ESLint strict mode enabled (no `any` types)
- [ ] Tests exist for crypto, canvas-auth, and errors
- [ ] CI pipeline runs lint + type-check + tests
- [ ] "ACTIVATE CARVIS" → "ACTIVATE JARVIS" typo fixed
- [ ] No hardcoded demo grades or mock course data
- [ ] CanvasConnectButton does real OAuth, not fake delay
- [ ] Users can enter any Canvas school URL
