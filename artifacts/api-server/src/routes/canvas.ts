import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, coursesTable, assignmentsTable, gradesTable, activationEventsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
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

function scopedCourseId(userId: string, canvasCourseId: string) {
  return `${userId}__c${canvasCourseId}`;
}

function scopedAssignmentId(scopedCourse: string, canvasAssignmentId: string) {
  return `${scopedCourse}__a${canvasAssignmentId}`;
}

// Allowed phases for lastSyncPhase. Keep in sync with the dashboard banner copy.
const SYNC_PHASES = ["idle", "courses", "assignments", "grades", "done", "error"] as const;
type SyncPhase = typeof SYNC_PHASES[number];

async function setSyncState(
  userId: string,
  phase: SyncPhase,
  errorMessage?: string | null
): Promise<void> {
  try {
    await db
      .update(usersTable)
      .set({
        lastSyncPhase: phase,
        lastSyncAt: new Date(),
        lastSyncError: errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
  } catch (err) {
    // Sync state is best-effort; don't break the sync itself if this write fails.
    console.warn("Failed to update sync state:", err);
  }
}

router.post("/canvas/sync", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { getCanvasToken } = await import("../lib/auth.js");
  const token = await getCanvasToken(user);
  if (!token || !user.canvasBaseUrl) {
    res.status(400).json({ error: "Canvas not connected — sign in with Canvas first", code: "canvas_required" });
    return;
  }

  // Mark sync as in-progress before any network calls. Done synchronously so the
  // dashboard's poll sees the new phase even if the rest of the sync takes 30+ seconds.
  await setSyncState(user.id, "courses");

  let courseCount = 0;
  let partialError: string | null = null;

  try {
    const rawCourses = await fetchCanvasCourses(token, user.canvasBaseUrl) as Record<string, unknown>[];

    for (const c of rawCourses) {
      if (!c["id"] || c["workflow_state"] !== "available") continue;
      const courseId = scopedCourseId(user.id, String(c["id"]));

      const [existing] = await db
        .select({ id: coursesTable.id })
        .from(coursesTable)
        .where(and(eq(coursesTable.id, courseId), eq(coursesTable.userId, user.id)))
        .limit(1);

      const courseData = {
        userId: user.id,
        name: String(c["name"] || "Untitled Course"),
        code: c["course_code"] ? String(c["course_code"]) : null,
        color: c["course_color"] ? String(c["course_color"]) : null,
        lastSynced: new Date(),
      };

      if (existing) {
        await db.update(coursesTable).set(courseData).where(and(eq(coursesTable.id, courseId), eq(coursesTable.userId, user.id)));
      } else {
        await db.insert(coursesTable).values({ id: courseId, ...courseData });
      }
      courseCount++;
    }

    // Courses complete — advance to assignments phase.
    await setSyncState(user.id, "assignments");

    for (const c of rawCourses) {
      if (!c["id"] || c["workflow_state"] !== "available") continue;
      const courseId = scopedCourseId(user.id, String(c["id"]));

      try {
        const rawAssignments = await fetchCanvasAssignments(token, user.canvasBaseUrl, String(c["id"])) as Record<string, unknown>[];
        for (const a of rawAssignments) {
          if (!a["id"]) continue;
          const assignmentId = scopedAssignmentId(courseId, String(a["id"]));
          const [existingA] = await db
            .select({ id: assignmentsTable.id })
            .from(assignmentsTable)
            .where(eq(assignmentsTable.id, assignmentId))
            .limit(1);

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
        // Per-course assignment failure is non-fatal — capture but keep going.
        console.warn(`Assignment sync failed for course ${courseId}:`, err);
        if (!partialError) partialError = "Some assignments couldn't be loaded";
      }
    }

    // Assignments complete — advance to grades phase.
    await setSyncState(user.id, "grades");

    if (user.canvasUserId) {
      try {
        const enrollments = await fetchEnrollmentsWithGrades(token, user.canvasBaseUrl, user.canvasUserId);
        for (const eg of enrollments) {
          const scopedCourse = scopedCourseId(user.id, eg.courseId);
          const [course] = await db
            .select({ id: coursesTable.id })
            .from(coursesTable)
            .where(and(eq(coursesTable.id, scopedCourse), eq(coursesTable.userId, user.id)))
            .limit(1);
          if (!course) continue;

          const [existingGrade] = await db
            .select({ id: gradesTable.id })
            .from(gradesTable)
            .where(and(eq(gradesTable.userId, user.id), eq(gradesTable.courseId, scopedCourse)))
            .limit(1);

          const gradeData = {
            currentScore: eg.currentScore,
            finalScore: eg.finalScore,
            letterGrade: letterGrade(eg.currentScore),
            fetchedAt: new Date(),
          };
          if (existingGrade) {
            await db.update(gradesTable).set(gradeData).where(eq(gradesTable.id, existingGrade.id));
          } else {
            await db.insert(gradesTable).values({ userId: user.id, courseId: scopedCourse, ...gradeData });
          }
        }
      } catch (err) {
        console.warn("Grades sync failed (non-fatal):", err);
        if (!partialError) partialError = "Grades couldn't be loaded";
        else partialError += " and grades couldn't be loaded";
      }
    }

    // Done — phase=done with any partial error surfaced.
    await setSyncState(user.id, "done", partialError);

    // Record activation event on first successful sync.
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activationEventsTable)
        .where(and(eq(activationEventsTable.userId, user.id), eq(activationEventsTable.eventType, "first_sync_completed")));
      if (count === 0) {
        await db.insert(activationEventsTable).values({ userId: user.id, eventType: "first_sync_completed" });
      }
    } catch (err) {
      console.warn("Failed to record activation event:", err);
    }

    res.json({ success: true, courseCount });
  } catch (err) {
    console.error("Canvas sync error:", err);
    // Top-level failure — phase=error. The dashboard will show the retry banner.
    await setSyncState(user.id, "error", err instanceof Error ? err.message : "Sync failed");
    res.status(500).json({ error: "Canvas sync failed", code: "server_error" });
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
    res.status(500).json({ error: "Failed to fetch grades", code: "server_error" });
  }
});

// Polled by the dashboard to drive the FirstRunBanner. Returns the current phase plus
// the last-known error (for partial-success UX). The phase advances through
// idle → courses → assignments → grades → done as sync progresses.
router.get("/canvas/sync-status", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  res.json({
    phase: user.lastSyncPhase ?? "idle",
    lastSyncAt: user.lastSyncAt,
    error: user.lastSyncError,
    canvasBaseUrl: user.canvasBaseUrl,
  });
});

// Records a one-time activation event. Used to compute the activation metric
// (Sean Ellis must-have) and to back the README/GT essay with real retention numbers.
const activationEventSchema = z.object({
  eventType: z.enum(["first_sync_completed", "first_question_asked", "first_voice_used"]),
});

router.post("/canvas/activation", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = activationEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  try {
    // De-dupe: only record the first occurrence of each event type per user.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activationEventsTable)
      .where(and(
        eq(activationEventsTable.userId, user.id),
        eq(activationEventsTable.eventType, parsed.data.eventType),
      ));

    if (count > 0) {
      res.json({ ok: true, deduped: true });
      return;
    }

    await db.insert(activationEventsTable).values({
      userId: user.id,
      eventType: parsed.data.eventType,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Activation event error:", err);
    res.status(500).json({ error: "Failed to record activation event" });
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

    // Verify ownership via course → user
    const [result] = await db
      .select({
        assignmentId: assignmentsTable.id,
        courseId: coursesTable.id,
      })
      .from(assignmentsTable)
      .innerJoin(coursesTable, eq(assignmentsTable.courseId, coursesTable.id))
      .where(and(eq(assignmentsTable.id, assignmentId), eq(coursesTable.userId, user.id)))
      .limit(1);

    if (!result) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    // Update local DB
    await db.update(assignmentsTable)
      .set({ completed, updatedAt: new Date() })
      .where(eq(assignmentsTable.id, assignmentId));

    // Best-effort Canvas write-back — extract Canvas IDs from scoped keys
    // Scoped IDs: course = "userId__c<canvasCourseId>", assignment = "courseId__a<canvasAssignmentId>"
    const { getCanvasToken } = await import("../lib/auth.js");
    const token = await getCanvasToken(user);
    if (token && user.canvasBaseUrl) {
      try {
        const canvasCourseId = result.courseId.split("__c").pop();
        const canvasAssignmentId = result.assignmentId.split("__a").pop();
        if (canvasCourseId && canvasAssignmentId) {
          const canvasBase = user.canvasBaseUrl.replace(/\/+$/, "");
          await fetch(
            `${canvasBase}/api/v1/courses/${canvasCourseId}/assignments/${canvasAssignmentId}/submissions/self`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ submission: { excused: completed } }),
            }
          );
        }
      } catch (canvasErr) {
        // Canvas API update is best-effort — local DB already updated
        console.warn("Canvas write-back failed (non-fatal):", canvasErr);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Toggle assignment error:", err);
    res.status(500).json({ error: "Failed to update assignment" });
  }
});

export default router;
