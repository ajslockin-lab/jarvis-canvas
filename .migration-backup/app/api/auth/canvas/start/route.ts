import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/canvas-auth";
import { canvasUrlSchema } from "@/lib/validators";
import { apiError } from "@/lib/errors";
import { randomBytes } from "crypto";

/**
 * POST /api/auth/canvas/start
 * Body: { canvasUrl: "https://school.instructure.com" }
 * Redirects user to their school's Canvas OAuth endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = canvasUrlSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { canvasUrl } = parsed.data;
    const state = randomBytes(16).toString("hex");
    const authorizeUrl = buildAuthorizeUrl(canvasUrl, state);

    const response = NextResponse.json({ url: authorizeUrl });
    response.cookies.set("canvas_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    response.cookies.set("canvas_oauth_url", canvasUrl, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Canvas OAuth start error:", error);
    return apiError("INTERNAL");
  }
}
