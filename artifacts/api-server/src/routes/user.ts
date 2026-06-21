import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, coursesTable, assignmentsTable } from "@workspace/db/schema";
import { eq, and, gte, or, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { z } from "zod";

const router = Router();

router.get("/user/data", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const now = new Date();
    const courses = await db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.userId, user.id));

    const coursesWithAssignments = await Promise.all(
      courses.map(async (course) => {
        // Only return incomplete assignments with future due dates (or no due date)
        const assignments = await db
          .select()
          .from(assignmentsTable)
          .where(
            and(
              eq(assignmentsTable.courseId, course.id),
              eq(assignmentsTable.completed, false),
              or(
                gte(assignmentsTable.dueDate, now),
                isNull(assignmentsTable.dueDate)
              )
            )
          );
        return { ...course, assignments };
      })
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        canvasBaseUrl: user.canvasBaseUrl,
      },
      courses: coursesWithAssignments,
      hasData: coursesWithAssignments.length > 0,
    });
  } catch (err) {
    console.error("User data error:", err);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

// Constrained vocabulary matches the dropdown in the sign-in UI so we can actually
// count responses later. Add new values here AND in REFERRAL_OPTIONS in SignInPage.tsx.
const preferencesSchema = z.object({
  referredFrom: z.enum([
    "friend",
    "classmate",
    "reddit",
    "twitter",
    "school_email",
    "search",
    "other",
  ]),
});

router.patch("/user/preferences", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  try {
    // One-time capture: never overwrite a previously-set value.
    if (user.referredFrom) {
      res.json({ ok: true, unchanged: true });
      return;
    }

    await db
      .update(usersTable)
      .set({ referredFrom: parsed.data.referredFrom, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    res.json({ ok: true });
  } catch (err) {
    console.error("Update preferences error:", err);
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

export default router;