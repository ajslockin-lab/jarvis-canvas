import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/canvas-auth";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/canvas
 * Canvas OAuth callback — exchanges code for tokens, upserts user, sets session cookie.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    const storedState = req.cookies.get("canvas_oauth_state")?.value;
    const canvasUrl = req.cookies.get("canvas_oauth_url")?.value;

    if (!code || !state || state !== storedState || !canvasUrl) {
      return NextResponse.redirect(
        new URL("/settings?error=canvas_auth_failed", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
      );
    }

    const tokenResult = await exchangeCodeForToken(canvasUrl, code);

    // Get user info from Canvas
    const meRes = await fetch(`${canvasUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
    });
    const meData = meRes.ok ? await meRes.json() : null;
    const email = meData?.email ?? `canvas-${tokenResult.canvasUserId}@${new URL(canvasUrl).hostname}`;
    const name = meData?.name ?? "Canvas Student";

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        canvasBaseUrl: canvasUrl,
        canvasAccessTokenEncrypted: encrypt(tokenResult.accessToken),
        canvasRefreshTokenEncrypted: encrypt(tokenResult.refreshToken),
        canvasTokenExpiresAt: new Date(Date.now() + tokenResult.expiresIn * 1000),
        canvasUserId: tokenResult.canvasUserId,
      },
      update: {
        name,
        canvasBaseUrl: canvasUrl,
        canvasAccessTokenEncrypted: encrypt(tokenResult.accessToken),
        canvasRefreshTokenEncrypted: encrypt(tokenResult.refreshToken),
        canvasTokenExpiresAt: new Date(Date.now() + tokenResult.expiresIn * 1000),
        canvasUserId: tokenResult.canvasUserId,
      },
    });

    const response = NextResponse.redirect(
      new URL("/dashboard", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    );
    response.cookies.delete("canvas_oauth_state");
    response.cookies.delete("canvas_oauth_url");
    response.cookies.set("canvas_user_email", user.email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Canvas OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/settings?error=canvas_auth_failed", process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    );
  }
}
