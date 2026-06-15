import { NextResponse } from "next/server";
import { requireAuth, getCanvasToken } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/canvas/grades
 * Returns real grades for the authenticated user from the local DB.
 * Grades are synced from Canvas via the /api/canvas/sync route.
 */
export async function GET() {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const grades = await prisma.grade.findMany({
      where: { userId: user.id },
      include: { course: { select: { name: true, code: true } } },
      orderBy: { fetchedAt: "desc" },
    });

    const formatted = grades.map((g) => ({
      name: g.course.name,
      code: g.course.code,
      currentScore: g.currentScore,
      finalScore: g.finalScore,
      letterGrade: g.letterGrade,
      fetchedAt: g.fetchedAt,
    }));

    return NextResponse.json({ grades: formatted });
  } catch (error) {
    console.error("Grades fetch error:", error);
    return apiError("INTERNAL");
  }
}
