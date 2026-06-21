import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, assignmentsTable, conversationsTable, remindersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { classifyIntent, generateResponse } from "../lib/nlu.js";
import { z } from "zod";

const router = Router();

const voiceCommandSchema = z.object({
  text: z.string().min(1, "Text is required").max(1000, "Text too long"),
});

router.post("/voice/command", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = voiceCommandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  const { text } = parsed.data;

  try {
    const now = new Date();
    const courses = await db
      .select({ id: coursesTable.id, name: coursesTable.name })
      .from(coursesTable)
      .where(eq(coursesTable.userId, user.id));

    const assignments = (
      await Promise.all(
        courses.map(async (c) => {
          const items = await db
            .select()
            .from(assignmentsTable)
            .where(
              and(
                eq(assignmentsTable.courseId, c.id),
                eq(assignmentsTable.completed, false)
              )
            );
          return items.map((a) => ({ ...a, courseName: c.name }));
        })
      )
    )
      .flat()
      .filter((a) => !a.dueDate || a.dueDate >= now);

    // Load active reminders for context
    const reminders = await db
      .select()
      .from(remindersTable)
      .where(and(eq(remindersTable.userId, user.id), eq(remindersTable.active, true)));

    const nlu = await classifyIntent(text);
    const response = await generateResponse(nlu.intent, nlu.entities, { assignments, reminders });

    try {
      await db.insert(conversationsTable).values({ userId: user.id, role: "user", message: text, intent: nlu.intent });
      await db.insert(conversationsTable).values({ userId: user.id, role: "assistant", message: response });
    } catch (err) {
      console.warn("Could not save conversation:", err);
    }

    res.json({ intent: nlu.intent, response, confidence: nlu.confidence });
  } catch (err) {
    console.error("Voice command error:", err);
    res.status(500).json({ error: "Voice command processing failed" });
  }
});

export default router;
