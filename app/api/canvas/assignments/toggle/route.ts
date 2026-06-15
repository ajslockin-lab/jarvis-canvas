import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCanvasToken } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const toggleSchema = z.object({
  assignmentId: z.string().min(1),
  completed: z.boolean(),
});

/**
 * PATCH /api/canvas/assignments/toggle
 * Toggle assignment completion status.
 * Updates local DB and (if Canvas token available) marks submission in Canvas.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const body = await req.json();
    const parsed = toggleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { assignmentId, completed } = parsed.data;

    // Verify ownership via course → user
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: { select: { userId: true, id: true } } },
    });

    if (!assignment || assignment.course.userId !== user.id) {
      return apiError("NOT_FOUND", { error: "Assignment not found" });
    }

    // Update local DB
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { completed },
    });

    // Try to update Canvas submission (non-blocking — local takes priority)
    const token = await getCanvasToken(user);
    if (token && user.canvasBaseUrl) {
      try {
        await fetch(
          `${user.canvasBaseUrl}/api/v1/courses/${assignment.course.id}/assignments/${assignmentId}/submissions/self`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              submission: { excused: completed },
            }),
          }
        );
      } catch {
        // Canvas API update is best-effort — local DB already updated
      }
    }

    return NextResponse.json({ success: true, assignmentId, completed });
  } catch (error) {
    console.error("Assignment toggle error:", error);
    return apiError("INTERNAL");
  }
}
