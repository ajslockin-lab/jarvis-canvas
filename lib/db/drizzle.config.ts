import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Pointing at jarvis.ts explicitly (not the ./*.ts glob) — index.ts only
// re-exports from jarvis.ts, but a multi-file glob can confuse drizzle-kit's
// filename-derived table filter and produce silent failures. Single file is
// both faster and more deterministic.
export default defineConfig({
  schema: "./src/schema/jarvis.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
