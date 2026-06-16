import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/errors";
import { z } from "zod";

const patSchema = z.object({
  canvasUrl: z
    .string()
    .min(1, "Canvas URL is required")
    .regex(
      /^https?:\/\/[a-z0-9-]+\.instructure\.com$/,
      "Must be a valid Canvas URL (e.g., https://school.instructure.com)"
    )
    .transform((url) => url.replace(/\/+$/, "")),
  pat: z.string().min(1, "Access token is required"),
});

/**
 * POST /api/auth/canvas/pat
 * Verifies a Canvas Personal Access Token, upserts user,
 * sets a session cookie, and returns user info.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = patSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { canvasUrl, pat } = parsed.data;

    // Verify the PAT by hitting Canvas API
    const meRes = await fetch(`${canvasUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${pat}` },
    });

    if (!meRes.ok) {
      if (meRes.status === 401) {
        return apiError("CANVAS_AUTH", { error: "Invalid access token — check your Canvas token and try again" });
      }
      if (meRes.status === 403) {
        return apiError("CANVAS_AUTH", { error: "Token doesn't have permission — make sure you generated it with full scope" });
      }
      return apiError("CANVAS_API", { error: `Canvas returned ${meRes.status} — check your Canvas URL` });
    }

    const meData = await meRes.json();
    const email = meData.email || `canvas-${meData.id}@${new URL(canvasUrl).hostname}`;
    const name = meData.name || "Canvas Student";
    const canvasUserId = String(meData.id);

    // Upsert user with encrypted PAT
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        canvasBaseUrl: canvasUrl,
        canvasAccessTokenEncrypted: encrypt(pat),
        canvasRefreshTokenEncrypted: null,
        canvasTokenExpiresAt: null,
        canvasUserId,
      },
      update: {
        name,
        canvasBaseUrl: canvasUrl,
        canvasAccessTokenEncrypted: encrypt(pat),
        canvasRefreshTokenEncrypted: null,
        canvasTokenExpiresAt: null,
        canvasUserId,
      },
    });

    // Set session cookie and return success
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    });

    response.cookies.set("canvas_user_email", user.email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Canvas PAT auth error:", error);
    return apiError("INTERNAL");
  }
}
