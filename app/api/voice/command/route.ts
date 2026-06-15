import { NextRequest, NextResponse } from "next/server";
import { classifyIntent, generateResponse } from "@/lib/nlu";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    // Get user context (first user for now, or create one)
    let user = await prisma.user.findFirst({});
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "student@gavirtual.instructure.com",
          name: "GAVS Student",
          canvasToken: process.env.CANVAS_PERSONAL_TOKEN || "",
          canvasDomain: process.env.CANVAS_DOMAIN || "",
        },
      });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        courses: {
          include: {
            assignments: { where: { completed: false } },
          },
        },
        reminders: { where: { active: true } },
      },
    });

    const context: Record<string, unknown> = {};
    if (userData) {
      type CourseWithAssignments = {
        id: string;
        name: string;
        assignments: { id: string; name: string; dueDate: Date | null }[];
      };
      context.assignments = (userData.courses as CourseWithAssignments[]).flatMap(
        (c) => c.assignments.map((a) => ({ ...a, courseName: c.name }))
      );
      context.reminders = userData.reminders;
    }

    // NLU: classify intent
    const nlu = await classifyIntent(text);

    // Generate response based on intent
    const response = await generateResponse(nlu.intent, nlu.entities, context);

    // Save conversation
    if (user) {
      await prisma.conversation.create({
        data: {
          userId: user.id,
          role: "user",
          message: text,
          intent: nlu.intent,
        },
      });
      await prisma.conversation.create({
        data: {
          userId: user.id,
          role: "assistant",
          message: response,
        },
      });
    }

    return NextResponse.json({
      intent: nlu.intent,
      response,
      confidence: nlu.confidence,
    });
  } catch (error) {
    console.error("Voice command error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
