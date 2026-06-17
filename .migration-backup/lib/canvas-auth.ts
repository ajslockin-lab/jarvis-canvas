import { encrypt, decrypt } from "./crypto";
import { prisma } from "./prisma";

const SCOPES = [
  "url:GET|/api/v1/users/:id",
  "url:GET|/api/v1/courses",
  "url:GET|/api/v1/courses/:course_id/assignments",
  "url:GET|/api/v1/courses/:course_id/enrollments",
  "url:PUT|/api/v1/courses/:course_id/assignments/:id",
].join(" ");

/**
 * Build the Canvas OAuth 2.0 authorize URL for user redirect.
 */
export function buildAuthorizeUrl(canvasBaseUrl: string, state: string): string {
  const base = canvasBaseUrl.replace(/\/+$/, "");
  const clientId = process.env.CANVAS_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/canvas`;

  const params = new URLSearchParams({
    client_id: clientId ?? "",
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
  });

  return `${base}/login/oauth2/auth?${params.toString()}`;
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  canvasUserId: string;
}

/**
 * Exchange an OAuth authorization code for access + refresh tokens.
 */
export async function exchangeCodeForToken(
  canvasBaseUrl: string,
  code: string
): Promise<TokenResult> {
  const base = canvasBaseUrl.replace(/\/+$/, "");
  const clientId = process.env.CANVAS_CLIENT_ID;
  const clientSecret = process.env.CANVAS_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/canvas`;

  const res = await fetch(`${base}/login/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canvas token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
    canvasUserId: String(data.user?.id ?? ""),
  };
}

/**
 * Refresh an expired Canvas access token using the stored refresh token.
 * Returns the new access token, or null if refresh fails.
 */
export async function refreshCanvasToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      canvasBaseUrl: true,
      canvasRefreshTokenEncrypted: true,
    },
  });

  if (!user?.canvasRefreshTokenEncrypted || !user?.canvasBaseUrl) {
    return null;
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(user.canvasRefreshTokenEncrypted);
  } catch {
    return null;
  }

  const base = user.canvasBaseUrl.replace(/\/+$/, "");
  const clientId = process.env.CANVAS_CLIENT_ID;
  const clientSecret = process.env.CANVAS_CLIENT_SECRET;

  try {
    const res = await fetch(`${base}/login/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const newAccessToken: string = data.access_token;
    const expiresIn: number = data.expires_in ?? 3600;

    await prisma.user.update({
      where: { id: userId },
      data: {
        canvasAccessTokenEncrypted: encrypt(newAccessToken),
        canvasTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    return newAccessToken;
  } catch {
    return null;
  }
}
