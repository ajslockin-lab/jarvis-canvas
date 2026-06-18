import { vi } from "vitest";

process.env.ENCRYPTION_KEY =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
process.env.DATABASE_URL = "postgresql://localhost/test";

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  usersTable: { id: "id", email: "email", name: "name" },
  sessionsTable: { id: "id", userId: "userId", expiresAt: "expiresAt" },
  coursesTable: { id: "id", userId: "userId", name: "name" },
  assignmentsTable: { id: "id", courseId: "courseId", name: "name" },
  gradesTable: { id: "id", userId: "userId", courseId: "courseId" },
  conversationsTable: { id: "id", userId: "userId", role: "role", message: "message", intent: "intent" },
}));
