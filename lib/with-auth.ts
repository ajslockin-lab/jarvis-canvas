import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { apiError } from "./errors";
import { prisma } from "./prisma";
import { NextResponse } from "next/server";

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

/**
 * Validates the NextAuth session and loads the full user record.
 * Returns { user, error } — if error is non-null, return it from the route handler.
 */
export async function requireAuth(): Promise<{ user: AuthedUser; error: null } | { user: null; error: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { user: null, error: apiError("UNAUTHORIZED") };
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
    return { user: null, error: apiError("NOT_FOUND", { error: "User not found" }) };
  }

  return { user, error: null };
}

/**
 * Decrypts and returns the user's Canvas access token.
 * Works with both OAuth tokens (with refresh) and Personal Access Tokens (no expiry).
 * Returns null if no token is stored.
 */
export async function getCanvasToken(user: AuthedUser): Promise<string | null> {
  if (!user.canvasAccessTokenEncrypted || !user.canvasBaseUrl) {
    return null;
  }

  // If token has an expiry and is expired, try OAuth refresh
  if (user.canvasTokenExpiresAt && new Date() > user.canvasTokenExpiresAt) {
    if (user.canvasRefreshTokenEncrypted) {
      const { refreshCanvasToken } = await import("./canvas-auth");
      const newToken = await refreshCanvasToken(user.id);
      if (!newToken) return null;
      return newToken;
    }
    // PATs don't expire — if there's no refresh token, the token is still valid
  }

  const { decrypt } = await import("./crypto");
  return decrypt(user.canvasAccessTokenEncrypted);
}
