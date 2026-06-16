import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { apiError } from "./errors";
import { prisma } from "./prisma";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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
 * Validates authentication and loads the full user record.
 * Checks NextAuth session first, then falls back to canvas_user_email cookie.
 * Returns { user, error } — if error is non-null, return it from the route handler.
 */
export async function requireAuth(): Promise<{ user: AuthedUser; error: null } | { user: null; error: NextResponse }> {
  let email: string | undefined | null = null;

  // Try NextAuth session first
  try {
    const session = await getServerSession(authOptions);
    email = session?.user?.email;
  } catch {
    // NextAuth might fail in edge cases — fall through to cookie
  }

  // Fall back to canvas_user_email cookie
  if (!email) {
    try {
      const cookieStore = await cookies();
      const cookie = cookieStore.get("canvas_user_email");
      if (cookie?.value) {
        email = decodeURIComponent(cookie.value);
      }
    } catch {
      // cookies() might not be available in all contexts
    }
  }

  if (!email) {
    return { user: null, error: apiError("UNAUTHORIZED") };
  }

  const user = await prisma.user.findUnique({
    where: { email },
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
