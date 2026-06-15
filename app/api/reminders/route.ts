import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/reminders — list user's reminders
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const reminders = await prisma.reminder.findMany({
      where: { userId: user.id, active: true },
      orderBy: { triggeredAt: "asc" },
    });

    return NextResponse.json(reminders);
  } catch (error) {
    console.error("Get reminders error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/reminders — create a new reminder
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { assignmentId, type, triggeredAt } = await req.json();

    const reminder = await prisma.reminder.create({
      data: {
        userId: user.id,
        assignmentId: assignmentId || null,
        type: type || "custom",
        triggeredAt: new Date(triggeredAt),
        active: true,
      },
    });

    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    console.error("Create reminder error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// PATCH /api/reminders — deactivate a reminder
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, active } = await req.json();

    const reminder = await prisma.reminder.updateMany({
      where: { id, userId: (await prisma.user.findFirst({ where: { email: session.user.email }, select: { id: true } }))?.id },
      data: { active },
    });

    return NextResponse.json(reminder);
  } catch (error) {
    console.error("Update reminder error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
