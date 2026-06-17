import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto.js";
import { fetchCanvasUser } from "../lib/canvas-fetch.js";
import { z } from "zod";

const router = Router();

const canvasUrlSchema = z.object({
  canvasUrl: z
    .string()
    .min(1, "Canvas URL is required")
    .regex(/^https?:\/\/[a-z0-9-]+\.instructure\.com$/, "Must be a valid Canvas URL"),
});

const patSchema = z.object({
  canvasUrl: z.string().min(1, "Canvas URL is required"),
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

    res.cookie("canvas_user_email", encodeURIComponent(email), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({ success: true, user: { id: userId, email, name: canvasUser.name } });
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
  res.clearCookie("canvas_user_email", { path: "/" });
  res.json({ success: true });
});

export default router;
