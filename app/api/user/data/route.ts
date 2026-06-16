import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth(req);
    if (authError) return authError;

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
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

    if (!fullUser) {
      return NextResponse.json({ courses: [], hasData: false });
    }

    return NextResponse.json({
      user: fullUser,
      courses: fullUser.courses,
      hasData: true,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return apiError("INTERNAL");
  }
}
