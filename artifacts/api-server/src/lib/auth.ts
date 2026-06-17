import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { decrypt } from "./crypto.js";

export interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
  canvasBaseUrl: string | null;
  canvasAccessTokenEncrypted: string | null;
  canvasRefreshTokenEncrypted: string | null;
  canvasTokenExpiresAt: Date | null;
  canvasUserId: string | null;
}

export async function requireAuth(
  req: Request,
  res: Response
): Promise<AuthedUser | null> {
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

export async function getCanvasToken(user: AuthedUser): Promise<string | null> {
  if (!user.canvasAccessTokenEncrypted) return null;
  try {
    return decrypt(user.canvasAccessTokenEncrypted);
  } catch {
    return null;
  }
}
