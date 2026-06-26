// Background reminder scheduler (Phase 1).
//
// The /reminders POST route sends an immediate push only for reminders that
// fire within the next 60 seconds — anything further out gets persisted but
// nothing fires. This scheduler picks up those persisted reminders on a 60s
// tick and pushes them when their triggeredAt falls within the tick window.
//
// Pattern mirrors sync-scheduler.ts: a single setInterval, opt-in via env,
// dynamic-imports to avoid circular deps, and per-tick concurrency caps.

import { db } from "@workspace/db";
import { remindersTable, assignmentsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";

const TICK_INTERVAL_MS = 60 * 1000;   // 1 minute — reminders can fire any second past the boundary
const WINDOW_MS = 60 * 1000;          // pick up reminders whose trigger time is within the next minute
const MAX_CONCURRENT = 10;            // max parallel push sends per tick; web-push already parallelizes within a user

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function fireReminder(reminder: { id: string; userId: string; assignmentId: string | null; title: string | null; body: string | null; url: string | null }) {
  // Dynamic import keeps us out of any potential circular dep with the route
  // that owns the same webpush helper, and lets the module stay bundled even
  // if webpush isn't initialized (webpush.configure is idempotent on first call).
  const { sendPushToUser } = await import("./webpush.js");

  // If the reminder has a stored title/body we just use them. Otherwise we
  // look up the linked assignment so the push has something useful to say.
  // Either way, if no useful text comes out we fall back to a generic notice.
  let pushTitle = reminder.title ?? "Carvis reminder";
  let pushBody = reminder.body ?? "You have a reminder.";
  let pushUrl = reminder.url ?? undefined;

  if (!reminder.body && reminder.assignmentId) {
    try {
      const [assignment] = await db
        .select({ name: assignmentsTable.name, url: assignmentsTable.url })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, reminder.assignmentId))
        .limit(1);
      if (assignment) {
        pushTitle = reminder.title ?? "Assignment due soon";
        pushBody = assignment.name;
        pushUrl = reminder.url ?? assignment.url ?? undefined;
      }
    } catch (err) {
      logger.warn({ err, reminderId: reminder.id }, "Assignment lookup for reminder failed (non-fatal)");
    }
  }

  try {
    await sendPushToUser(reminder.userId, { title: pushTitle, body: pushBody, url: pushUrl });
    // Mark inactive only after a successful send — the route's "fires within
    // 60s" branch is fire-and-forget but for the long-tail reminders we want
    // at-least-once delivery (next tick will retry if the push errors).
    await db
      .update(remindersTable)
      .set({ active: false })
      .where(and(eq(remindersTable.id, reminder.id), eq(remindersTable.userId, reminder.userId)));
  } catch (err) {
    logger.error({ err, reminderId: reminder.id }, "Failed to fire reminder push");
    // Leave active=true so the next tick retries. Once a reminder is hours
    // past due it's no longer useful — a future refinement could add a
    // max-staleness filter, but the at-least-once contract is more important
    // for v1.
  }
}

async function tick() {
  try {
    // Window: now <= triggeredAt <= now + WINDOW_MS.
    // Restricting to the upper bound keeps us from re-firing ancient reminders
    // every minute; the lower bound lets us catch anything missed by a prior
    // tick (deploy, restart, transient DB error).
    const now = new Date();
    const horizon = new Date(now.getTime() + WINDOW_MS);

    const due = await db
      .select({
        id: remindersTable.id,
        userId: remindersTable.userId,
        assignmentId: remindersTable.assignmentId,
        title: remindersTable.title,
        body: remindersTable.body,
        url: remindersTable.url,
      })
      .from(remindersTable)
      .where(
        and(
          eq(remindersTable.active, true),
          sql`(${remindersTable.triggeredAt} <= ${horizon})`,
          sql`(${remindersTable.triggeredAt} >= ${new Date(now.getTime() - 5 * 60_000)})`,
        ),
      )
      .limit(MAX_CONCURRENT);

    if (due.length === 0) return;

    logger.info({ count: due.length }, "Reminder tick: firing due reminders");
    await Promise.allSettled(due.map(fireReminder));
  } catch (err) {
    logger.error({ err }, "Reminder scheduler tick failed");
  }
}

export function startReminderScheduler() {
  if (process.env["REMINDER_SCHEDULER_ENABLED"] !== "true") {
    logger.info("Reminder scheduler disabled (set REMINDER_SCHEDULER_ENABLED=true to enable)");
    return;
  }

  if (intervalHandle) {
    logger.warn("Reminder scheduler already running");
    return;
  }

  logger.info({ intervalMs: TICK_INTERVAL_MS, windowMs: WINDOW_MS }, "Starting reminder scheduler");
  intervalHandle = setInterval(() => void tick(), TICK_INTERVAL_MS);
  // First tick runs immediately so reminders fired during deploys/dead time
  // still deliver without waiting another minute.
  void tick();
}

export function stopReminderScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info("Reminder scheduler stopped");
  }
}