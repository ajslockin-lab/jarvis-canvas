import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/canvas-auth";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/canvas
 * Canvas OAuth callback — exchanges code for tokens, upserts user,
 * then redirects to the dashboard with a session cookie.
 */
export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Canvas returned an OAuth error (e.g. invalid_client, access_denied)
    if (error) {
      console.error("Canvas OAuth error:", error, errorDescription);
      return NextResponse.redirect(
        new URL(`/signin?error=${encodeURIComponent(errorDescription || error)}`, baseUrl)
      );
    }

    const storedState = req.cookies.get("canvas_oauth_state")?.value;
    const canvasUrl = req.cookies.get("canvas_oauth_url")?.value;

    if (!code || !state || state !== storedState || !canvasUrl) {
      return NextResponse.redirect(
        new URL("/signin?error=oauth_state_mismatch", baseUrl)
      );
    }

    let tokenResult;
    try {
      tokenResult = await exchangeCodeForToken(canvasUrl, code);
    } catch (err) {
      console.error("Canvas token exchange failed:", err);
      return NextResponse.redirect(
        new URL("/signin?error=token_exchange_failed", baseUrl)
      );
    }

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

    // Set the user email cookie so the NextAuth credentials provider can pick it up,
    // then redirect to a page that calls NextAuth signIn()
    const response = NextResponse.redirect(
      new URL("/auth/callback?email=" + encodeURIComponent(user.email), baseUrl)
    );
    response.cookies.delete("canvas_oauth_state");
    response.cookies.delete("canvas_oauth_url");
    response.cookies.set("canvas_user_email", user.email, {
      httpOnly: false, // readable by client-side JS
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 min — just needs to survive the redirect
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Canvas OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/signin?error=canvas_auth_failed", baseUrl)
    );
  }
}
