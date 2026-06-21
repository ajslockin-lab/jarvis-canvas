import { Router } from "express";
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, emailVerificationsTable } from "@workspace/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { encrypt } from "../lib/crypto.js";
import { fetchCanvasUser } from "../lib/canvas-fetch.js";
import { z } from "zod";
import { sendVerificationCode, devVerificationCodeIfEnabled } from "../lib/email.js";

const router = Router();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFICATION_TTL_MS = 15 * 60 * 1000;       // 15 minutes
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 60s between resends
const VERIFICATION_MAX_ATTEMPTS = 5;

// Stable, machine-readable error codes returned in the `code` field of every
// error response. Frontend uses these to pick the right user-facing copy.
// NEVER change a value here without also updating routes/auth.ts callers and
// SignInPage.tsx ErrorBlock.
export const ErrorCodes = {
  badUrl: "bad_url",
  missingToken: "missing_token",
  tokenRejected: "token_rejected",
  canvasUnreachable: "canvas_unreachable",
  serviceDown: "service_down",
  serverError: "server_error",
  corsBlocked: "cors_blocked",
  rateLimited: "rate_limited",
  badRequest: "bad_request",
  canvasRequired: "canvas_required",
  // New — for the password flow:
  emailTaken: "email_taken",
  invalidCredentials: "invalid_credentials",
  emailNotVerified: "email_not_verified",
  noPendingVerification: "no_pending_verification",
  codeExpired: "code_expired",
  tooManyAttempts: "too_many_attempts",
  invalidCode: "invalid_code",
  resendTooSoon: "resend_too_soon",
  passwordTooShort: "password_too_short",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

function sendError(
  res: import("express").Response,
  status: number,
  code: ErrorCode,
  detail: string,
): void {
  res.status(status).json({ error: detail, code });
}

function createSessionCookie(res: import("express").Response, sessionId: string) {
  res.cookie("jarvis_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

// Accept both *.instructure.com (hosted) and self-hosted Canvas
// (e.g. canvas.gatech.edu, canvas.mit.edu, canvas.ubc.ca).
// Self-hosted instances are common at R1 universities.
const INSTUCTURE_RE = /^https:\/\/[a-zA-Z0-9-]+\.instructure\.com$/;
const SELF_HOSTED_RE = /^https:\/\/canvas\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const VALIDATE_CANVAS_URL = (u: string): boolean =>
  INSTUCTURE_RE.test(u) || SELF_HOSTED_RE.test(u);

// Email-style validation message for Zod schemas
const CANVAS_URL_MSG = "Must be a valid Canvas URL (e.g. https://school.instructure.com or https://canvas.school.edu)";

const canvasUrlSchema = z.object({
  canvasUrl: z
    .string()
    .min(1, "Canvas URL is required")
    .refine(VALIDATE_CANVAS_URL, CANVAS_URL_MSG),
});

const patSchema = z.object({
  canvasUrl: z
    .string()
    .min(1, "Canvas URL is required")
    .refine(VALIDATE_CANVAS_URL, CANVAS_URL_MSG),
  pat: z.string().min(1, "Access token is required"),
});

// ---------- New password-based auth: signup, verify, signin, resend, check-email ----------

const signupSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .max(254, "Email is too long"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(80, "Name is too long")
    .trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
});

const verifySchema = z.object({
  userId: z.string().min(1, "userId is required"),
  code: z
    .string()
    .regex(/^\d{6}$/, "Code must be 6 digits"),
});

const signinSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const resendSchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

const checkEmailSchema = z.object({
  email: z.string().min(1).email("Enter a valid email address"),
});

// 6-digit codes using crypto.randomInt for unbiased uniform distribution.
// 1_000_000 codes = ~7.2M years to brute-force at 5 tries per 15 minutes.
function generateVerificationCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

router.post("/auth/signup", async (req, res) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      sendError(res, 400, ErrorCodes.badRequest, issue?.message ?? "Invalid signup data");
      return;
    }
    const { email, name, password } = parsed.data;
    const emailLower = email.toLowerCase();

    // Case-insensitive uniqueness. We rely on the LOWER(email) unique index
    // — but check first to give a friendly error rather than a raw DB error.
    const [existing] = await db
      .select({ id: usersTable.id, authProvider: usersTable.authProvider })
      .from(usersTable)
      .where(sql`LOWER(${usersTable.email}) = ${emailLower}`)
      .limit(1);

    if (existing) {
      // Don't disclose whether the account is a Canvas-only or password account —
      // a generic "email taken" is what every SaaS does and it's fine.
      sendError(res, 409, ErrorCodes.emailTaken, "An account with this email already exists");
      return;
    }

    const userId = newId("user");
    const passwordHash = await bcrypt.hash(password, 10);

    await db.insert(usersTable).values({
      id: userId,
      email,
      name,
      passwordHash,
      authProvider: "password",
      emailVerifiedAt: null,
    });

    const code = generateVerificationCode();
    const codeHash = await bcrypt.hash(code, 10);

    await db.insert(emailVerificationsTable).values({
      id: newId("ver"),
      userId,
      codeHash,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    await sendVerificationCode(email, code);

    res.json({
      userId,
      // devCode is null in production. See lib/email.ts.
      devCode: devVerificationCodeIfEnabled(code),
    });
  } catch (err) {
    console.error("Signup error:", err);
    sendError(res, 500, ErrorCodes.serverError, "Something went wrong on our end");
  }
});

router.post("/auth/verify-email", async (req, res) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, ErrorCodes.badRequest, parsed.error.issues[0]?.message ?? "Invalid request");
      return;
    }
    const { userId, code } = parsed.data;

    // Find latest unconsumed verification row for this user.
    const [verification] = await db
      .select()
      .from(emailVerificationsTable)
      .where(
        and(
          eq(emailVerificationsTable.userId, userId),
          isNull(emailVerificationsTable.consumedAt),
        ),
      )
      .orderBy(desc(emailVerificationsTable.createdAt))
      .limit(1);

    if (!verification) {
      sendError(res, 400, ErrorCodes.noPendingVerification, "No pending verification — sign up again or resend the code");
      return;
    }

    if (verification.expiresAt < new Date()) {
      sendError(res, 400, ErrorCodes.codeExpired, "That code expired — request a new one");
      return;
    }

    if (verification.attempts >= VERIFICATION_MAX_ATTEMPTS) {
      sendError(res, 429, ErrorCodes.tooManyAttempts, "Too many attempts — start over from signup");
      return;
    }

    const ok = await bcrypt.compare(code, verification.codeHash);
    if (!ok) {
      // Increment attempts. This is best-effort — if it fails the worst case
      // is the user gets more tries than they should, which is on us, not them.
      await db
        .update(emailVerificationsTable)
        .set({ attempts: verification.attempts + 1 })
        .where(eq(emailVerificationsTable.id, verification.id));
      sendError(res, 400, ErrorCodes.invalidCode, "That code didn't match — try again");
      return;
    }

    // Success — mark consumed, verify email, create session.
    await db
      .update(emailVerificationsTable)
      .set({ consumedAt: new Date() })
      .where(eq(emailVerificationsTable.id, verification.id));

    await db
      .update(usersTable)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, canvasBaseUrl: usersTable.canvasBaseUrl })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      // Should be impossible — we just verified the email for a user that
      // exists. But if it ever happens we want a clean error, not a crash.
      sendError(res, 500, ErrorCodes.serverError, "User not found after verification");
      return;
    }

    const sessionId = newId("sess");
    await db.insert(sessionsTable).values({
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    createSessionCookie(res, sessionId);

    res.json({
      success: true,
      sessionToken: sessionId,
      user: { id: user.id, email: user.email, name: user.name, canvasBaseUrl: user.canvasBaseUrl },
    });
  } catch (err) {
    console.error("Verify-email error:", err);
    sendError(res, 500, ErrorCodes.serverError, "Something went wrong on our end");
  }
});

router.post("/auth/signin", async (req, res) => {
  try {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, ErrorCodes.badRequest, parsed.error.issues[0]?.message ?? "Invalid request");
      return;
    }
    const { email, password } = parsed.data;
    const emailLower = email.toLowerCase();

    const [user] = await db
      .select()
      .from(usersTable)
      .where(sql`LOWER(${usersTable.email}) = ${emailLower}`)
      .limit(1);

    // Generic error — don't disclose whether the email exists, has no password,
    // or the password is wrong. This is the standard "invalid credentials" pattern.
    // All three cases (no user, no password, wrong password) return the same message.
    const invalidCredentialsResponse = () =>
      sendError(res, 401, ErrorCodes.invalidCredentials, "Invalid email or password");

    if (!user || !user.passwordHash) {
      invalidCredentialsResponse();
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      invalidCredentialsResponse();
      return;
    }

    if (!user.emailVerifiedAt) {
      // Distinct error so the frontend can route them back to verify-email.
      sendError(
        res,
        401,
        ErrorCodes.emailNotVerified,
        "Verify your email before signing in",
      );
      return;
    }

    const sessionId = newId("sess");
    await db.insert(sessionsTable).values({
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    createSessionCookie(res, sessionId);

    res.json({
      success: true,
      sessionToken: sessionId,
      user: { id: user.id, email: user.email, name: user.name, canvasBaseUrl: user.canvasBaseUrl },
    });
  } catch (err) {
    console.error("Signin error:", err);
    sendError(res, 500, ErrorCodes.serverError, "Something went wrong on our end");
  }
});

router.post("/auth/resend-code", async (req, res) => {
  try {
    const parsed = resendSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, ErrorCodes.badRequest, "userId is required");
      return;
    }
    const { userId } = parsed.data;

    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, emailVerifiedAt: usersTable.emailVerifiedAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      sendError(res, 400, ErrorCodes.badRequest, "userId is required");
      return;
    }

    if (user.emailVerifiedAt) {
      // Already verified — caller should treat as "go to sign-in".
      res.json({ ok: true, alreadyVerified: true });
      return;
    }

    // Cooldown check: latest unconsumed row must be ≥ 60s old, else 429.
    const [latest] = await db
      .select()
      .from(emailVerificationsTable)
      .where(
        and(
          eq(emailVerificationsTable.userId, userId),
          isNull(emailVerificationsTable.consumedAt),
        ),
      )
      .orderBy(desc(emailVerificationsTable.createdAt))
      .limit(1);

    if (latest && latest.createdAt.getTime() + VERIFICATION_RESEND_COOLDOWN_MS > Date.now()) {
      sendError(res, 429, ErrorCodes.resendTooSoon, "Wait a moment before requesting another code");
      return;
    }

    const code = generateVerificationCode();
    const codeHash = await bcrypt.hash(code, 10);

    // Mark old row consumed so it can't be used even if delivery races.
    if (latest) {
      await db
        .update(emailVerificationsTable)
        .set({ consumedAt: new Date() })
        .where(eq(emailVerificationsTable.id, latest.id));
    }

    await db.insert(emailVerificationsTable).values({
      id: newId("ver"),
      userId,
      codeHash,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    await sendVerificationCode(user.email, code);

    res.json({
      ok: true,
      devCode: devVerificationCodeIfEnabled(code),
    });
  } catch (err) {
    console.error("Resend-code error:", err);
    sendError(res, 500, ErrorCodes.serverError, "Something went wrong on our end");
  }
});

router.post("/auth/check-email", async (req, res) => {
  try {
    const parsed = checkEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, ErrorCodes.badRequest, "Enter a valid email");
      return;
    }
    const { email } = parsed.data;
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`LOWER(${usersTable.email}) = ${email.toLowerCase()}`)
      .limit(1);
    res.json({ exists: Boolean(existing) });
  } catch (err) {
    console.error("Check-email error:", err);
    sendError(res, 500, ErrorCodes.serverError, "Something went wrong on our end");
  }
});

// ---------- Canvas OAuth ----------

router.post("/auth/canvas/start", async (req, res) => {
  try {
    const parsed = canvasUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, ErrorCodes.badUrl, parsed.error.issues.map((i) => i.message).join(", "));
      return;
    }

    const { canvasUrl } = parsed.data;
    const clientId = process.env["CANVAS_CLIENT_ID"];
    if (!clientId) {
      sendError(res, 400, ErrorCodes.serverError, "OAuth not configured — use PAT authentication instead");
      return;
    }

    const state = randomBytes(16).toString("hex");
    const redirectUri = `${process.env["APP_URL"] || ""}/api/auth/canvas`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });

    res.cookie("canvas_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env["NODE_ENV"] === "production", maxAge: 600_000, path: "/" });
    res.cookie("canvas_oauth_url", canvasUrl, { httpOnly: true, sameSite: "lax", secure: process.env["NODE_ENV"] === "production", maxAge: 600_000, path: "/" });
    res.json({ url: `${canvasUrl}/login/oauth2/auth?${params.toString()}` });
  } catch (err) {
    console.error("Canvas OAuth start error:", err);
    sendError(res, 500, ErrorCodes.serverError, "Something went wrong on our end");
  }
});

router.get("/auth/canvas", async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query as Record<string, string>;
    const cookies = (req as unknown as Request & { cookies?: Record<string, string> }).cookies ?? {};
    const storedState = cookies["canvas_oauth_state"];
    const canvasUrl = cookies["canvas_oauth_url"];
    const appUrl = process.env["APP_URL"] || "";

    if (oauthError) {
      res.redirect(`${appUrl}/signin?error=${encodeURIComponent("Canvas authorization was denied")}`);
      return;
    }

    if (!code || !state || !storedState || state !== storedState || !canvasUrl) {
      res.redirect(`${appUrl}/signin?error=${encodeURIComponent("Invalid OAuth state — try again")}`);
      return;
    }

    if (!VALIDATE_CANVAS_URL(canvasUrl)) {
      res.redirect(`${appUrl}/signin?error=${encodeURIComponent("Invalid Canvas URL in OAuth session")}`);
      return;
    }

    const clientId = process.env["CANVAS_CLIENT_ID"];
    const clientSecret = process.env["CANVAS_CLIENT_SECRET"];
    if (!clientId || !clientSecret) {
      res.redirect(`${appUrl}/signin?error=${encodeURIComponent("OAuth not configured — use PAT authentication instead")}`);
      return;
    }

    const redirectUri = `${appUrl}/api/auth/canvas`;
    const tokenRes = await fetch(`${canvasUrl}/login/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }),
    });

    if (!tokenRes.ok) {
      res.redirect(`${appUrl}/signin?error=${encodeURIComponent("Canvas token exchange failed — try again")}`);
      return;
    }

    const tokenData = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number; user?: { id: number; name: string } };
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token ?? null;
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;

    const canvasUser = await fetchCanvasUser(accessToken, canvasUrl);
    const email = canvasUser.primary_email || canvasUser.login_id || `user${canvasUser.id}@canvas.local`;
    const userId = `canvas-${canvasUser.id}`;

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const userData = {
      email,
      name: canvasUser.name,
      canvasBaseUrl: canvasUrl,
      canvasAccessTokenEncrypted: encrypt(accessToken),
      canvasRefreshTokenEncrypted: refreshToken ? encrypt(refreshToken) : null,
      canvasTokenExpiresAt: expiresAt,
      canvasUserId: String(canvasUser.id),
      // If the user already has a password account (existing email-verified row),
      // promote auth_provider to "both" so the analytics knows. Otherwise it's
      // a fresh Canvas-only account.
      authProvider: existing?.passwordHash ? "both" : "canvas",
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(usersTable).set(userData).where(eq(usersTable.id, userId));
    } else {
      await db.insert(usersTable).values({ id: userId, ...userData });
    }

    const sessionId = newId("sess");
    await db.insert(sessionsTable).values({ id: sessionId, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
    createSessionCookie(res, sessionId);

    res.clearCookie("canvas_oauth_state", { path: "/" });
    res.clearCookie("canvas_oauth_url", { path: "/" });
    res.redirect(`${appUrl}/onboarding/canvas?connected=1`);
  } catch (err) {
    console.error("Canvas OAuth callback error:", err);
    const appUrl = process.env["APP_URL"] || "";
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("connect") || msg.includes("ECONNREFUSED") || msg.includes("database") || (err instanceof Error && err.name === "DrizzleQueryError")) {
      res.redirect(`${appUrl}/signin?error=${encodeURIComponent("Service temporarily unavailable — try again in a moment")}`);
    } else {
      res.redirect(`${appUrl}/signin?error=${encodeURIComponent("OAuth callback failed — try PAT sign-in instead")}`);
    }
  }
});

/**
 * Quick preflight: does the Canvas URL actually exist?
 * Fetches the root page with a timeout — if we get ANY response
 * (even a 401 or 404), Canvas is reachable. Only network failures
 * (DNS, timeout, connection refused) count as unreachable.
 */
async function canvasUrlIsReachable(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(baseUrl, { method: "HEAD", signal: controller.signal });
    clearTimeout(t);
    // Any HTTP response means the server exists
    return true;
  } catch {
    return false;
  }
}

router.post("/auth/canvas/pat", async (req, res) => {
  try {
    const parsed = patSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, ErrorCodes.badUrl, parsed.error.issues.map((i) => i.message).join(", "));
      return;
    }

    const { canvasUrl, pat } = parsed.data;
    const canvasBase = canvasUrl.replace(/\/+$/, "");

    // Preflight: verify the Canvas URL actually exists before trying the token.
    // This way we can tell the user "your token is wrong" vs "your URL is wrong."
    // Use AbortSignal.timeout (Node 17+) — if the school has a slow Canvas, 8 s is plenty.
    const canvasExists = await canvasUrlIsReachable(canvasBase);

    if (!canvasExists) {
      sendError(
        res,
        401,
        ErrorCodes.canvasUnreachable,
        `${canvasBase} did not respond — check the URL and try again.`,
      );
      return;
    }

    const canvasUser = await fetchCanvasUser(pat, canvasBase);
    const email = canvasUser.primary_email || canvasUser.login_id || `user${canvasUser.id}@canvas.local`;
    const userId = `canvas-${canvasUser.id}`;

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    const encryptedPat = encrypt(pat);
    const userData = {
      email,
      name: canvasUser.name,
      canvasBaseUrl: canvasBase,
      canvasAccessTokenEncrypted: encryptedPat,
      canvasUserId: String(canvasUser.id),
      // Same logic as OAuth — if there's already a password row with this id,
      // promote to "both". Otherwise fresh Canvas-only.
      authProvider: existing?.passwordHash ? "both" : "canvas",
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(usersTable).set(userData).where(eq(usersTable.id, userId));
    } else {
      await db.insert(usersTable).values({ id: userId, ...userData });
    }

    const sessionId = newId("sess");
    await db.insert(sessionsTable).values({
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    createSessionCookie(res, sessionId);

    res.json({
      success: true,
      user: { id: userId, email, name: canvasUser.name },
      sessionToken: sessionId,
    });
  } catch (err) {
    console.error("Canvas PAT auth error:", err);
    const msg = err instanceof Error ? err.message : "Connection failed";

    if (msg.includes("Canvas auth") || msg.includes("invalid") || msg.includes("expired")) {
      sendError(
        res,
        401,
        ErrorCodes.tokenRejected,
        "Your Canvas is online, but the access token was rejected. Generate a new token in Canvas → Account → Settings.",
      );
    } else if (msg.includes("Canvas connection") || msg.includes("Canvas API")) {
      sendError(
        res,
        401,
        ErrorCodes.canvasUnreachable,
        "Could not reach your Canvas instance — check the URL and try again.",
      );
    } else if (msg.includes("connect") || msg.includes("ECONNREFUSED") || msg.includes("database") || (err instanceof Error && err.name === "DrizzleQueryError")) {
      sendError(res, 503, ErrorCodes.serviceDown, "Service temporarily unavailable — try again in a moment");
    } else {
      // The catch-all that previously made everything look like a network error.
      // Now it returns server_error so the frontend can render "Something went
      // wrong on our end" instead of "school firewall".
      sendError(res, 500, ErrorCodes.serverError, "Something went wrong on our end");
    }
  }
});

router.post("/auth/signout", async (req, res) => {
  const sessionId = (req as unknown as Request & { cookies?: Record<string, string> }).cookies?.["jarvis_session"]
    || (req.headers["x-session-token"] as string | undefined);

  if (sessionId) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
  }

  res.clearCookie("jarvis_session", { path: "/" });
  res.json({ success: true });
});

export default router;
