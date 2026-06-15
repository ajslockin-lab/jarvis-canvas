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
 * Checks if user has a valid Canvas connection.
 * Returns decrypted access token or null.
 */
export async function getCanvasToken(user: AuthedUser): Promise<string | null> {
  if (!user.canvasAccessTokenEncrypted || !user.canvasBaseUrl) {
    return null;
  }

  if (user.canvasTokenExpiresAt && new Date() > user.canvasTokenExpiresAt) {
    const { refreshCanvasToken } = await import("./canvas-auth");
    const newToken = await refreshCanvasToken(user.id);
    if (!newToken) return null;
    return newToken;
  }

  const { decrypt } = await import("./crypto");
  return decrypt(user.canvasAccessTokenEncrypted);
}
