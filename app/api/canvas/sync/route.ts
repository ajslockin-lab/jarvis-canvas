import { NextResponse } from "next/server";
import { fetchCanvasCourses, fetchCanvasAssignments } from "@/lib/canvas";
import { prisma } from "@/lib/prisma";

// Use personal token from env
const CANVAS_TOKEN = process.env.CANVAS_PERSONAL_TOKEN;
const CANVAS_DOMAIN = process.env.CANVAS_DOMAIN;

export async function POST() {
  try {
    if (!CANVAS_TOKEN || !CANVAS_DOMAIN) {
      return NextResponse.json(
        { error: "Canvas credentials not configured" },
        { status: 500 }
      );
    }

    // Get or create user
    let user = await prisma.user.findFirst({
      where: { email: "student@gavirtual.instructure.com" },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "student@gavirtual.instructure.com",
          name: "GAVS Student",
          canvasToken: CANVAS_TOKEN,
          canvasDomain: CANVAS_DOMAIN,
        },
      });
    }

    // Fetch courses from Canvas
    const courses = await fetchCanvasCourses(CANVAS_TOKEN, CANVAS_DOMAIN);

    for (const c of courses || []) {
      if (!c.id) continue;

      // Only sync active courses
      if (c.workflow_state !== "available") continue;

      // Upsert course
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

      // Fetch and upsert assignments
      try {
        const assignments = await fetchCanvasAssignments(CANVAS_TOKEN, CANVAS_DOMAIN, String(c.id));
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

    return NextResponse.json({
      success: true,
      courseCount: courses?.length || 0,
    });
  } catch (error) {
    console.error("Canvas sync error:", error);
    return NextResponse.json(
      { error: "Canvas sync failed" },
      { status: 500 }
    );
  }
}
