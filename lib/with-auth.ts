import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { apiError } from "./errors";
import { prisma } from "./prisma";
import { NextResponse, NextRequest } from "next/server";

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
 * Accepts an optional NextRequest to read cookies directly.
 * Checks NextAuth session first, then falls back to canvas_user_email cookie.
 */
export async function requireAuth(req?: NextRequest): Promise<{ user: AuthedUser; error: null } | { user: null; error: NextResponse }> {
  let email: string | undefined | null = null;

  // Try X-Auth-Email header first (used by extension iframe in cross-site contexts
  // where SameSite=Lax cookies are blocked by the browser)
  if (req) {
    const authEmail = req.headers.get("x-auth-email");
    if (authEmail) {
      email = decodeURIComponent(authEmail);
    }
  }

  // Try NextAuth session
  if (!email) {
    try {
      const session = await getServerSession(authOptions);
      email = session?.user?.email;
    } catch {
      // NextAuth might fail in edge cases — fall through to cookie
    }
  }

  // Fall back to canvas_user_email cookie from the request
  if (!email && req) {
    const cookie = req.cookies.get("canvas_user_email");
    if (cookie?.value) {
      email = decodeURIComponent(cookie.value);
    }
  }

  // Last resort: try next/headers cookies (works in some contexts)
  if (!email) {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const cookie = cookieStore.get("canvas_user_email");
      if (cookie?.value) {
        email = decodeURIComponent(cookie.value);
      }
    } catch {
      // Not available in this context
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
 */
export async function getCanvasToken(user: AuthedUser): Promise<string | null> {
  if (!user.canvasAccessTokenEncrypted || !user.canvasBaseUrl) {
    return null;
  }

  if (user.canvasTokenExpiresAt && new Date() > user.canvasTokenExpiresAt) {
    if (user.canvasRefreshTokenEncrypted) {
      const { refreshCanvasToken } = await import("./canvas-auth");
      const newToken = await refreshCanvasToken(user.id);
      if (!newToken) return null;
      return newToken;
    }
  }

  const { decrypt } = await import("./crypto");
  return decrypt(user.canvasAccessTokenEncrypted);
}
