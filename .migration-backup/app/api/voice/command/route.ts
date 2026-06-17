import { NextRequest, NextResponse } from "next/server";
import { classifyIntent, generateResponse } from "@/lib/nlu";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { voiceCommandSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth(req);
    if (authError) return authError;

    const body = await req.json();
    const parsed = voiceCommandSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { text } = parsed.data;

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

    const nlu = await classifyIntent(text);
    const response = await generateResponse(nlu.intent, nlu.entities, context);

    await prisma.conversation.create({
      data: { userId: user.id, role: "user", message: text, intent: nlu.intent },
    });
    await prisma.conversation.create({
      data: { userId: user.id, role: "assistant", message: response },
    });

    return NextResponse.json({
      intent: nlu.intent,
      response,
      confidence: nlu.confidence,
    });
  } catch (error) {
    console.error("Voice command error:", error);
    return apiError("INTERNAL");
  }
}
