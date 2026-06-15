import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Get the first user (for personal token setup)
    const user = await prisma.user.findFirst({
      include: {
        courses: {
          include: {
            assignments: {
              where: {
                completed: false,
                dueDate: { gte: new Date() },
              },
              orderBy: { dueDate: "asc" },
            },
          },
          orderBy: { lastSynced: "desc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ courses: [], hasData: false });
    }

    return NextResponse.json({
      user,
      courses: user.courses,
      hasData: true,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }
}
