// Background Canvas sync scheduler.
//
// Instead of requiring users to manually hit "sync now" every time, this
// module runs a periodic check (every 5 minutes) and syncs users whose
// last sync is stale (15+ min old). It's deliberately simple — no Redis,
// no BullMQ, just a cron tick + a Postgres-backed cooldown.
//
// To enable: import and call `startSyncScheduler()` in index.ts.
// Disabled by default — set CANVAS_SYNC_ENABLED=true to opt in.

import { db } from "@workspace/db";
import { usersTable, coursesTable, assignmentsTable, gradesTable } from "@workspace/db/schema";
import { and, isNotNull, sql, eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { fetchCanvasCourses, fetchCanvasAssignments, fetchEnrollmentsWithGrades } from "./canvas-fetch.js";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;   // check every 5 min
const MIN_SYNC_AGE_MS = 15 * 60 * 1000;  // don't re-sync within 15 min
const MAX_CONCURRENT = 3;                 // max parallel syncs per tick

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function scopedCourseId(userId: string, canvasCourseId: string) {
  return `${userId}__c${canvasCourseId}`;
}

function scopedAssignmentId(scopedCourse: string, canvasAssignmentId: string) {
  return `${scopedCourse}__a${canvasAssignmentId}`;
}

function letterGrade(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

async function syncUser(user: { id: string; canvasBaseUrl: string; canvasUserId: string | null }) {
  // Import getCanvasToken dynamically to avoid circular deps at module level
  const { getCanvasToken } = await import("./auth.js");
  const { decrypt } = await import("./crypto.js");

  // Fetch the full user record (we need encrypted token fields)
  const [fullUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!fullUser?.canvasAccessTokenEncrypted) return;

  const token = await getCanvasToken(fullUser);
  if (!token) {
    logger.warn({ userId: user.id }, "Background sync: no valid token, skipping");
    return;
  }

  const canvasBase = user.canvasBaseUrl.replace(/\/+$/, "");

  try {
    await db.update(usersTable).set({
      lastSyncPhase: "courses",
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));

    const rawCourses = await fetchCanvasCourses(token, canvasBase) as Record<string, unknown>[];

    // ── Courses ──
    for (const c of rawCourses) {
      if (!c["id"] || c["workflow_state"] !== "available") continue;
      const courseId = scopedCourseId(user.id, String(c["id"]));
      const courseData = {
        userId: user.id,
        name: String(c["name"] || "Untitled Course"),
        code: c["course_code"] ? String(c["course_code"]) : null,
        color: c["course_color"] ? String(c["course_color"]) : null,
        lastSynced: new Date(),
      };
      // Upsert: try insert, on conflict update
      try {
        await db.insert(coursesTable).values({ id: courseId, ...courseData });
      } catch {
        await db.update(coursesTable).set(courseData).where(eq(coursesTable.id, courseId));
      }
    }

    // ── Assignments ──
    await db.update(usersTable).set({ lastSyncPhase: "assignments", updatedAt: new Date() }).where(eq(usersTable.id, user.id));

    for (const c of rawCourses) {
      if (!c["id"] || c["workflow_state"] !== "available") continue;
      const courseId = scopedCourseId(user.id, String(c["id"]));
      try {
        const rawAssignments = await fetchCanvasAssignments(token, canvasBase, String(c["id"])) as Record<string, unknown>[];
        for (const a of rawAssignments) {
          if (!a["id"]) continue;
          const assignmentId = scopedAssignmentId(courseId, String(a["id"]));
          const assignmentData = {
            courseId,
            name: String(a["name"] || "Untitled Assignment"),
            description: a["description"] ? String(a["description"]) : null,
            dueDate: a["due_at"] ? new Date(String(a["due_at"])) : null,
            points: a["points_possible"] ? Number(a["points_possible"]) : null,
            url: a["html_url"] ? String(a["html_url"]) : null,
            updatedAt: new Date(),
          };
          try {
            await db.insert(assignmentsTable).values({ id: assignmentId, ...assignmentData, completed: false });
          } catch {
            await db.update(assignmentsTable).set(assignmentData).where(eq(assignmentsTable.id, assignmentId));
          }
        }
      } catch (err) {
        logger.warn({ userId: user.id, courseId, err }, "Background sync: assignment fetch failed for course");
      }
    }

    // ── Grades ──
    await db.update(usersTable).set({ lastSyncPhase: "grades", updatedAt: new Date() }).where(eq(usersTable.id, user.id));

    if (user.canvasUserId) {
      try {
        const enrollments = await fetchEnrollmentsWithGrades(token, canvasBase, user.canvasUserId);
        for (const eg of enrollments) {
          const scopedCourse = scopedCourseId(user.id, eg.courseId);
          const gradeData = {
            currentScore: eg.currentScore,
            finalScore: eg.finalScore,
            letterGrade: letterGrade(eg.currentScore),
            fetchedAt: new Date(),
          };
          try {
            await db.insert(gradesTable).values({ userId: user.id, courseId: scopedCourse, ...gradeData });
          } catch {
            // Update existing grade row
            const [existing] = await db.select({ id: gradesTable.id }).from(gradesTable)
              .where(and(eq(gradesTable.userId, user.id), eq(gradesTable.courseId, scopedCourse)))
              .limit(1);
            if (existing) {
              await db.update(gradesTable).set(gradeData).where(eq(gradesTable.id, existing.id));
            }
          }
        }
      } catch (err) {
        logger.warn({ userId: user.id, err }, "Background sync: grades fetch failed (non-fatal)");
      }
    }

    // ── Calendar (Phase 2 / Tier 0) ──
    // Last phase. Wrapped in its own try/catch so a misbehaving iCal feed
    // never blocks `done` — courses/assignments/grades are already landed
    // and the scheduler will retry on the next 15-min tick.
    await db.update(usersTable).set({ lastSyncPhase: "calendar", updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    try {
      const { syncUserCalendar } = await import("./calendar-sync.js");
      await syncUserCalendar({ id: user.id, canvasBaseUrl: canvasBase }, token);
    } catch (err) {
      logger.warn({ userId: user.id, err }, "Background sync: calendar sync failed (non-fatal)");
    }

    // Done
    await db.update(usersTable).set({ lastSyncPhase: "done", lastSyncError: null, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    logger.info({ userId: user.id }, "Background sync completed");

  } catch (err) {
    logger.error({ userId: user.id, err }, "Background sync failed");
    await db.update(usersTable).set({
      lastSyncPhase: "error",
      lastSyncError: err instanceof Error ? err.message : "Sync failed",
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));
  }
}

async function tick() {
  try {
    const staleThreshold = new Date(Date.now() - MIN_SYNC_AGE_MS);
    const staleUsers = await db
      .select({
        id: usersTable.id,
        canvasBaseUrl: usersTable.canvasBaseUrl,
        canvasUserId: usersTable.canvasUserId,
      })
      .from(usersTable)
      .where(
        and(
          isNotNull(usersTable.canvasAccessTokenEncrypted),
          isNotNull(usersTable.canvasBaseUrl),
          sql`(${usersTable.lastSyncAt} IS NULL OR ${usersTable.lastSyncAt} < ${staleThreshold})`,
        )
      )
      .limit(MAX_CONCURRENT);

    if (staleUsers.length === 0) return;

    // `usersTable.canvasBaseUrl` is nullable; this scheduler only knows how to
    // sync Canvas-authenticated users, so drop the null-baseUrl rows before
    // mapping. (PAT-only users without a school URL can't be re-synced; that's
    // expected and handled elsewhere in the auth flow.)
    const syncableUsers = staleUsers.filter(
      (u): u is typeof u & { canvasBaseUrl: string } => u.canvasBaseUrl !== null,
    );
    if (syncableUsers.length === 0) return;

    logger.info({ count: syncableUsers.length }, "Background sync tick: syncing stale users");
    await Promise.allSettled(syncableUsers.map((u) => syncUser(u)));
  } catch (err) {
    logger.error({ err }, "Background sync tick error");
  }
}

export function startSyncScheduler() {
  if (process.env["CANVAS_SYNC_ENABLED"] !== "true") {
    logger.info("Background sync scheduler disabled (set CANVAS_SYNC_ENABLED=true to enable)");
    return;
  }

  if (intervalHandle) {
    logger.warn("Background sync scheduler already running");
    return;
  }

  logger.info({ intervalMs: SYNC_INTERVAL_MS, minAgeMs: MIN_SYNC_AGE_MS }, "Starting background sync scheduler");
  intervalHandle = setInterval(() => void tick(), SYNC_INTERVAL_MS);
  void tick(); // first tick immediately
}

export function stopSyncScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info("Background sync scheduler stopped");
  }
}
