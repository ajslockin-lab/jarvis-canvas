import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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
  let email: string | null = null;

  const authHeader = req.headers["x-auth-email"];
  if (typeof authHeader === "string" && authHeader) {
    email = decodeURIComponent(authHeader);
  }

  if (!email) {
    const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.["canvas_user_email"];
    if (cookie) email = decodeURIComponent(cookie);
  }

  if (!email) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
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
