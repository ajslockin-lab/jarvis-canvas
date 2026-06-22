import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { remindersTable, assignmentsTable } from "@workspace/db/schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { sendPushToUser } from "../lib/webpush.js";
import { z } from "zod";

const router = Router();

const createReminderSchema = z.object({
  assignmentId: z.string().optional(),
  type: z.enum(["custom", "deadline", "study"]).default("custom"),
  triggeredAt: z.string(),
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(280).optional(),
  url: z.string().url().max(2048).optional(),
});

const updateReminderSchema = z.object({
  id: z.string(),
  active: z.boolean().optional(),
});

// GET /api/reminders — list active reminders for current user
router.get("/reminders", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const reminders = await db
      .select()
      .from(remindersTable)
      .where(and(eq(remindersTable.userId, user.id), eq(remindersTable.active, true)))
      .orderBy(remindersTable.triggeredAt);

    res.json(reminders);
  } catch (err) {
    console.error("Get reminders error:", err);
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

// POST /api/reminders — create a new reminder
router.post("/reminders", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const parsed = createReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
      return;
    }

    const { assignmentId, type, triggeredAt, title, body, url } = parsed.data;

    // If the reminder is tied to an assignment, pull its name + course so
    // the push notification has something meaningful to say. Otherwise fall
    // back to the caller's title/body or a generic "Carvis" prefix.
    let pushTitle = title ?? "Carvis";
    let pushBody = body ?? "You have a reminder.";
    let pushUrl = url;
    if (assignmentId) {
      const [assignment] = await db
        .select({
          name: assignmentsTable.name,
          dueDate: assignmentsTable.dueDate,
          url: assignmentsTable.url,
        })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, assignmentId))
        .limit(1);
      if (assignment) {
        pushTitle = title ?? "Assignment due soon";
        pushBody = body ?? assignment.name;
        pushUrl = url ?? assignment.url ?? undefined;
      }
    }

    const [reminder] = await db
      .insert(remindersTable)
      .values({
        id: randomBytes(8).toString("hex"),
        userId: user.id,
        assignmentId: assignmentId || null,
        type,
        triggeredAt: new Date(triggeredAt),
        active: true,
      })
      .returning();

    // If the reminder fires within 60 seconds, send the push now rather
    // than waiting for a scheduler tick (the scheduler is still TBD — for
    // now, immediate reminders cover the assignment-deadline use case the
    // client creates from the dashboard).
    const due = new Date(triggeredAt).getTime();
    if (due - Date.now() <= 60_000) {
      void sendPushToUser(user.id, { title: pushTitle, body: pushBody, url: pushUrl });
    }

    res.status(201).json(reminder);
  } catch (err) {
    console.error("Create reminder error:", err);
    res.status(500).json({ error: "Failed to create reminder" });
  }
});

// PATCH /api/reminders — update (dismiss) reminder
router.patch("/reminders", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const parsed = updateReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
      return;
    }

    const { id, active } = parsed.data;

    const [existing] = await db
      .select()
      .from(remindersTable)
      .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, user.id)));

    if (!existing) {
      res.status(404).json({ error: "Reminder not found" });
      return;
    }

    const [updated] = await db
      .update(remindersTable)
      .set({ active: active ?? existing.active })
      .where(eq(remindersTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("Update reminder error:", err);
    res.status(500).json({ error: "Failed to update reminders" });
  }
});

// GET /api/reminders/due — list reminders due in the next 5 minutes for
// the current user. Used by future scheduler work — kept simple here so
// the route can be polled cheaply without re-querying everything.
router.get("/reminders/due", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 5 * 60_000);
    const due = await db
      .select()
      .from(remindersTable)
      .where(
        and(
          eq(remindersTable.userId, user.id),
          eq(remindersTable.active, true),
          gte(remindersTable.triggeredAt, now),
          lte(remindersTable.triggeredAt, horizon),
        ),
      );
    res.json(due);
  } catch (err) {
    console.error("List due reminders error:", err);
    res.status(500).json({ error: "Failed to fetch due reminders" });
  }
});

export default router;