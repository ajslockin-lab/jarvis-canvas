import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, type User } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { decrypt, encrypt } from "./crypto.js";

export type AuthedUser = User;

// Origins that are allowed to make authenticated requests.
// Prevents CSRF via cross-origin POST (the sameSite=lax cookie already blocks
// most cross-origin POSTs, but the x-session-token header path needs this).
const TRUSTED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:20034",
  "http://localhost:3000",
  // Production origins should be set via env var
  ...(process.env["ALLOWED_ORIGINS"]?.split(",").filter(Boolean) ?? []),
].map(o => o.replace(/\/+$/, "")));

export async function requireAuth(
  req: Request,
  res: Response
): Promise<AuthedUser | null> {
  // Origin/Referer check for CSRF protection on the x-session-token path.
  // Cookie-based auth is already protected by sameSite=lax, but session-token
  // headers can be sent cross-origin — so we validate Origin here.
  const origin = req.headers["origin"] ?? req.headers["referer"]?.split("/").slice(0, 3).join("/");
  if (origin && !TRUSTED_ORIGINS.has(origin.replace(/\/+$/, ""))) {
    // Allow requests with no Origin (same-origin navigations, curl, etc.)
    // but block requests from explicitly untrusted origins
    const originHost = (() => {
      try { return new URL(origin).origin; } catch { return ""; }
    })();
    if (originHost && !TRUSTED_ORIGINS.has(originHost)) {
      res.status(403).json({ error: "Origin not allowed" });
      return null;
    }
  }

  let sessionId: string | null = null;

  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.["jarvis_session"];
  if (cookie) sessionId = cookie;

  if (!sessionId) {
    const header = req.headers["x-session-token"];
    if (typeof header === "string" && header) sessionId = header;
  }

  if (!sessionId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const now = new Date();
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, sessionId), gt(sessionsTable.expiresAt, now)))
    .limit(1);

  if (!session) {
    res.status(401).json({ error: "Session expired or invalid" });
    return null;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return null;
  }

  return user;
}

/**
 * Get a valid Canvas access token for the user.
 * If the token is expired but a refresh token is available, refreshes it automatically.
 * Returns null if no valid token can be obtained.
 */
export async function getCanvasToken(user: AuthedUser): Promise<string | null> {
  if (!user.canvasAccessTokenEncrypted) return null;

  let accessToken: string;
  try {
    accessToken = decrypt(user.canvasAccessTokenEncrypted);
  } catch {
    return null;
  }

  // If token has no expiry or hasn't expired yet, return it directly
  if (!user.canvasTokenExpiresAt || user.canvasTokenExpiresAt > new Date()) {
    return accessToken;
  }

  // Token is expired — try to refresh using stored refresh token
  const refreshed = await refreshCanvasToken(user);
  return refreshed;
}

/**
 * Refresh an expired Canvas access token using the stored refresh token.
 * Returns the new access token, or null if refresh fails.
 */
async function refreshCanvasToken(user: AuthedUser): Promise<string | null> {
  if (!user.canvasRefreshTokenEncrypted || !user.canvasBaseUrl) {
    return null;
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(user.canvasRefreshTokenEncrypted);
  } catch {
    return null;
  }

  const base = user.canvasBaseUrl.replace(/\/+$/, "");
  const clientId = process.env["CANVAS_CLIENT_ID"];
  const clientSecret = process.env["CANVAS_CLIENT_SECRET"];

  if (!clientId || !clientSecret) {
    // OAuth not configured — can't refresh, PAT tokens don't expire the same way
    return null;
  }

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
      console.warn(`Canvas token refresh failed (${res.status}) for user ${user.id}`);
      return null;
    }

    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      return null;
    }

    const expiresIn = data.expires_in ?? 3600;

    // Update the DB with the new access token + expiry
    await db
      .update(usersTable)
      .set({
        canvasAccessTokenEncrypted: encrypt(data.access_token),
        canvasTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    return data.access_token;
  } catch (err) {
    console.warn("Canvas token refresh error:", err);
    return null;
  }
}
