import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const signinSchema = z.object({
  email: z.string().email("Valid email is required"),
});

/**
 * POST /api/auth/canvas/signin
 * Verifies user exists after Canvas OAuth and returns user data.
 * The frontend calls NextAuth signIn("canvas", { email }) to create the session.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signinSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, canvasBaseUrl: true },
    });

    if (!user) {
      return apiError("NOT_FOUND", { error: "User not found — complete Canvas OAuth first" });
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, canvasConnected: !!user.canvasBaseUrl },
    });
  } catch (error) {
    console.error("Canvas sign-in error:", error);
    return apiError("INTERNAL");
  }
}
