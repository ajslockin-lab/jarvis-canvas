import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { createReminderSchema, updateReminderSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth(req);
    if (authError) return authError;

    const reminders = await prisma.reminder.findMany({
      where: { userId: user.id, active: true },
      orderBy: { triggeredAt: "asc" },
    });

    return NextResponse.json(reminders);
  } catch (error) {
    console.error("Get reminders error:", error);
    return apiError("INTERNAL");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth(req);
    if (authError) return authError;

    const body = await req.json();
    const parsed = createReminderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { assignmentId, type, triggeredAt } = parsed.data;

    const reminder = await prisma.reminder.create({
      data: {
        userId: user.id,
        assignmentId: assignmentId || null,
        type,
        triggeredAt: new Date(triggeredAt),
        active: true,
      },
    });

    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    console.error("Create reminder error:", error);
    return apiError("INTERNAL");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth(req);
    if (authError) return authError;

    const body = await req.json();
    const parsed = updateReminderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION", {
        error: parsed.error.issues.map((i) => i.message).join(", "),
      });
    }

    const { id, active } = parsed.data;

    const existing = await prisma.reminder.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return apiError("NOT_FOUND", { error: "Reminder not found" });
    }

    const reminder = await prisma.reminder.update({
      where: { id },
      data: { active: active ?? existing.active },
    });

    return NextResponse.json(reminder);
  } catch (error) {
    console.error("Update reminder error:", error);
    return apiError("INTERNAL");
  }
}
