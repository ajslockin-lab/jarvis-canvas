import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, coursesTable, assignmentsTable } from "@workspace/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

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
        const assignments = await db
          .select()
          .from(assignmentsTable)
          .where(
            and(
              eq(assignmentsTable.courseId, course.id),
              gte(assignmentsTable.dueDate, now)
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

export default router;
