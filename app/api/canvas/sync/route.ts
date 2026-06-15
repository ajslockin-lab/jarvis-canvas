import { NextResponse } from "next/server";
import { fetchCanvasCourses, fetchCanvasAssignments } from "@/lib/canvas";
import { fetchEnrollmentsWithGrades } from "@/lib/canvas-grades";
import { requireAuth, getCanvasToken } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

function computeLetterGrade(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export async function POST() {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const token = await getCanvasToken(user);
    if (!token || !user.canvasBaseUrl) {
      return apiError("CANVAS_AUTH", { error: "Canvas not connected — please link your Canvas account" });
    }

    const courses = await fetchCanvasCourses(token, user.canvasBaseUrl);

    let courseCount = 0;
    for (const c of courses || []) {
      if (!c.id || c.workflow_state !== "available") continue;

      await prisma.course.upsert({
        where: { id: String(c.id) },
        create: {
          id: String(c.id),
          userId: user.id,
          name: c.name || "Untitled Course",
          code: c.course_code || null,
          color: c.course_color || null,
          lastSynced: new Date(),
        },
        update: {
          name: c.name || "Untitled Course",
          code: c.course_code || null,
          color: c.course_color || null,
          lastSynced: new Date(),
        },
      });
      courseCount++;

      try {
        const assignments = await fetchCanvasAssignments(token, user.canvasBaseUrl, String(c.id));
        for (const a of assignments || []) {
          if (!a.id) continue;
          await prisma.assignment.upsert({
            where: { id: String(a.id) },
            create: {
              id: String(a.id),
              courseId: String(c.id),
              name: a.name || "Untitled Assignment",
              description: a.description || null,
              dueDate: a.due_at ? new Date(a.due_at) : null,
              points: a.points_possible || null,
              url: a.html_url || null,
              completed: false,
            },
            update: {
              name: a.name || "Untitled Assignment",
              description: a.description || null,
              dueDate: a.due_at ? new Date(a.due_at) : null,
              points: a.points_possible || null,
              url: a.html_url || null,
            },
          });
        }
      } catch (err) {
        console.warn(`Failed to sync assignments for course ${c.id}:`, err);
      }
    }

    // Sync grades from Canvas enrollments
    if (user.canvasUserId) {
      try {
        const enrollmentGrades = await fetchEnrollmentsWithGrades(
          token,
          user.canvasBaseUrl,
          user.canvasUserId
        );

        for (const eg of enrollmentGrades) {
          // Verify the course belongs to this user
          const course = await prisma.course.findFirst({
            where: { id: eg.courseId, userId: user.id },
          });
          if (!course) continue;

          const letterGrade = computeLetterGrade(eg.currentScore);

          await prisma.grade.upsert({
            where: {
              userId_courseId: { userId: user.id, courseId: eg.courseId },
            },
            create: {
              userId: user.id,
              courseId: eg.courseId,
              currentScore: eg.currentScore,
              finalScore: eg.finalScore,
              letterGrade,
              fetchedAt: new Date(),
            },
            update: {
              currentScore: eg.currentScore,
              finalScore: eg.finalScore,
              letterGrade,
              fetchedAt: new Date(),
            },
          });
        }
      } catch (err) {
        console.warn("Failed to sync grades:", err);
        // Non-fatal — sync still reports success for courses/assignments
      }
    }

    return NextResponse.json({ success: true, courseCount });
  } catch (error) {
    console.error("Canvas sync error:", error);
    return apiError("CANVAS_API", { error: "Canvas sync failed" });
  }
}
