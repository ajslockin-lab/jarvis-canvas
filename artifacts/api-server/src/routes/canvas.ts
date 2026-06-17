import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, coursesTable, assignmentsTable, gradesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { fetchCanvasCourses, fetchCanvasAssignments, fetchEnrollmentsWithGrades } from "../lib/canvas-fetch.js";
import { z } from "zod";

const router = Router();

function letterGrade(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

router.post("/canvas/sync", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { getCanvasToken } = await import("../lib/auth.js");
  const token = await getCanvasToken(user);
  if (!token || !user.canvasBaseUrl) {
    res.status(400).json({ error: "Canvas not connected — sign in with Canvas first" });
    return;
  }

  try {
    const rawCourses = await fetchCanvasCourses(token, user.canvasBaseUrl) as Record<string, unknown>[];
    let courseCount = 0;

    for (const c of rawCourses) {
      if (!c["id"] || c["workflow_state"] !== "available") continue;
      const courseId = String(c["id"]);

      const [existing] = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
      const courseData = {
        userId: user.id,
        name: String(c["name"] || "Untitled Course"),
        code: c["course_code"] ? String(c["course_code"]) : null,
        color: c["course_color"] ? String(c["course_color"]) : null,
        lastSynced: new Date(),
      };

      if (existing) {
        await db.update(coursesTable).set(courseData).where(eq(coursesTable.id, courseId));
      } else {
        await db.insert(coursesTable).values({ id: courseId, ...courseData });
      }
      courseCount++;

      try {
        const rawAssignments = await fetchCanvasAssignments(token, user.canvasBaseUrl, courseId) as Record<string, unknown>[];
        for (const a of rawAssignments) {
          if (!a["id"]) continue;
          const assignmentId = String(a["id"]);
          const [existingA] = await db.select({ id: assignmentsTable.id }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId)).limit(1);
          const assignmentData = {
            courseId,
            name: String(a["name"] || "Untitled Assignment"),
            description: a["description"] ? String(a["description"]) : null,
            dueDate: a["due_at"] ? new Date(String(a["due_at"])) : null,
            points: a["points_possible"] ? Number(a["points_possible"]) : null,
            url: a["html_url"] ? String(a["html_url"]) : null,
            updatedAt: new Date(),
          };
          if (existingA) {
            await db.update(assignmentsTable).set(assignmentData).where(eq(assignmentsTable.id, assignmentId));
          } else {
            await db.insert(assignmentsTable).values({ id: assignmentId, ...assignmentData, completed: false });
          }
        }
      } catch (err) {
        console.warn(`Assignment sync failed for course ${courseId}:`, err);
      }
    }

    if (user.canvasUserId) {
      try {
        const enrollments = await fetchEnrollmentsWithGrades(token, user.canvasBaseUrl, user.canvasUserId);
        for (const eg of enrollments) {
          const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(and(eq(coursesTable.id, eg.courseId), eq(coursesTable.userId, user.id))).limit(1);
          if (!course) continue;
          const [existingGrade] = await db.select({ id: gradesTable.id }).from(gradesTable)
            .where(and(eq(gradesTable.userId, user.id), eq(gradesTable.courseId, eg.courseId))).limit(1);
          const gradeData = { currentScore: eg.currentScore, finalScore: eg.finalScore, letterGrade: letterGrade(eg.currentScore), fetchedAt: new Date() };
          if (existingGrade) {
            await db.update(gradesTable).set(gradeData).where(eq(gradesTable.id, existingGrade.id));
          } else {
            await db.insert(gradesTable).values({ userId: user.id, courseId: eg.courseId, ...gradeData });
          }
        }
      } catch (err) {
        console.warn("Grades sync failed (non-fatal):", err);
      }
    }

    await db.update(usersTable).set({ updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    res.json({ success: true, courseCount });
  } catch (err) {
    console.error("Canvas sync error:", err);
    res.status(500).json({ error: "Canvas sync failed" });
  }
});

router.get("/canvas/grades", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const grades = await db
      .select({
        currentScore: gradesTable.currentScore,
        finalScore: gradesTable.finalScore,
        letterGrade: gradesTable.letterGrade,
        fetchedAt: gradesTable.fetchedAt,
        courseName: coursesTable.name,
        courseCode: coursesTable.code,
      })
      .from(gradesTable)
      .innerJoin(coursesTable, eq(gradesTable.courseId, coursesTable.id))
      .where(eq(gradesTable.userId, user.id));

    res.json({
      grades: grades.map((g) => ({
        name: g.courseName,
        code: g.courseCode,
        currentScore: g.currentScore,
        finalScore: g.finalScore,
        letterGrade: g.letterGrade,
        fetchedAt: g.fetchedAt,
      })),
    });
  } catch (err) {
    console.error("Grades fetch error:", err);
    res.status(500).json({ error: "Failed to fetch grades" });
  }
});

router.patch("/canvas/assignments/toggle", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const schema = z.object({ assignmentId: z.string().min(1), completed: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  try {
    const { assignmentId, completed } = parsed.data;
    const [assignment] = await db
      .select({ id: assignmentsTable.id })
      .from(assignmentsTable)
      .innerJoin(coursesTable, eq(assignmentsTable.courseId, coursesTable.id))
      .where(and(eq(assignmentsTable.id, assignmentId), eq(coursesTable.userId, user.id)))
      .limit(1);

    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    await db.update(assignmentsTable)
      .set({ completed, updatedAt: new Date() })
      .where(eq(assignmentsTable.id, assignmentId));

    res.json({ success: true });
  } catch (err) {
    console.error("Toggle assignment error:", err);
    res.status(500).json({ error: "Failed to update assignment" });
  }
});

export default router;
