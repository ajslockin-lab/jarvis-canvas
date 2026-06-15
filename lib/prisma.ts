// Prisma client singleton - call `npx prisma generate` to build types
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __prisma__?: PrismaClient;
};

export const prisma = globalForPrisma.__prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma__ = prisma;
}
