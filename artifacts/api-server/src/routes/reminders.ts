import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { remindersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { z } from "zod";

const router = Router();

const createReminderSchema = z.object({
  assignmentId: z.string().optional(),
  type: z.enum(["custom", "deadline", "study"]).default("custom"),
  triggeredAt: z.string(),
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

    const { assignmentId, type, triggeredAt } = parsed.data;

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

    res.status(201).json(reminder);
  } catch (err) {
    console.error("Create reminder error:", err);
    res.status(500).json({ error: "Failed to create reminder" });
  }
});

// PATCH /api/reminders — update (dismiss) a reminder
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
    res.status(500).json({ error: "Failed to update reminder" });
  }
});

export default router;
