import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { usersTable, sessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "../lib/crypto.js";
import { fetchCanvasUser } from "../lib/canvas-fetch.js";
import { z } from "zod";

const router = Router();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createSessionCookie(res: import("express").Response, sessionId: string) {
  res.cookie("jarvis_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

const canvasUrlSchema = z.object({
  canvasUrl: z
    .string()
    .min(1, "Canvas URL is required")
    .regex(/^https?:\/\/[a-z0-9-]+\.instructure\.com$/, "Must be a valid Canvas URL"),
});

const patSchema = z.object({
  canvasUrl: z
    .string()
    .min(1, "Canvas URL is required")
    .regex(/^https:\/\/[a-zA-Z0-9-]+\.instructure\.com$/, "Must be a valid Canvas URL (https://school.instructure.com)"),
  pat: z.string().min(1, "Access token is required"),
});

router.post("/auth/canvas/start", async (req, res) => {
  try {
    const parsed = canvasUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
      return;
    }

    const { canvasUrl } = parsed.data;
    const clientId = process.env["CANVAS_CLIENT_ID"];
    if (!clientId) {
      res.status(400).json({ error: "OAuth not configured — use PAT authentication instead" });
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

    res.cookie("canvas_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600_000, path: "/" });
    res.cookie("canvas_oauth_url", canvasUrl, { httpOnly: true, sameSite: "lax", maxAge: 600_000, path: "/" });
    res.json({ url: `${canvasUrl}/login/oauth2/auth?${params.toString()}` });
  } catch (err) {
    console.error("Canvas OAuth start error:", err);
    res.status(500).json({ error: "Internal server error" });
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

    if (!/^https:\/\/[a-zA-Z0-9-]+\.instructure\.com$/.test(canvasUrl)) {
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
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(usersTable).set(userData).where(eq(usersTable.id, userId));
    } else {
      await db.insert(usersTable).values({ id: userId, ...userData });
    }

    const sessionId = randomBytes(32).toString("hex");
    await db.insert(sessionsTable).values({ id: sessionId, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
    createSessionCookie(res, sessionId);

    res.clearCookie("canvas_oauth_state", { path: "/" });
    res.clearCookie("canvas_oauth_url", { path: "/" });
    res.redirect(`${appUrl}/dashboard`);
  } catch (err) {
    console.error("Canvas OAuth callback error:", err);
    const appUrl = process.env["APP_URL"] || "";
    res.redirect(`${appUrl}/signin?error=${encodeURIComponent("OAuth callback failed — try PAT sign-in instead")}`);
  }
});

router.post("/auth/canvas/pat", async (req, res) => {
  try {
    const parsed = patSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
      return;
    }

    const { canvasUrl, pat } = parsed.data;
    const canvasBase = canvasUrl.replace(/\/+$/, "");

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
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(usersTable).set(userData).where(eq(usersTable.id, userId));
    } else {
      await db.insert(usersTable).values({ id: userId, ...userData });
    }

    const sessionId = randomBytes(32).toString("hex");
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
    if (msg.includes("Canvas")) {
      res.status(401).json({ error: "Could not verify token with Canvas — check the URL and token" });
    } else {
      res.status(500).json({ error: "Internal server error" });
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
