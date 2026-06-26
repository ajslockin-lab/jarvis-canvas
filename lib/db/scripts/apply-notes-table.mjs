// apply-notes-table.mjs — execute 0007_notes.sql against the same
// DATABASE_URL the api server uses. Idempotent. Sibling of
// apply-security-hardening.mjs and apply-calendar-indexes.mjs.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlFile = path.join(root, "drizzle", "0007_notes.sql");

if (!existsSync(sqlFile)) {
  console.error(`missing migration file: ${sqlFile}`);
  process.exit(1);
}

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@127.0.0.1:54329/jarvis";

const { Client } = pg;
const client = new Client({ connectionString: url });
await client.connect();

try {
  const sql = readFileSync(sqlFile, "utf8");
  await client.query(sql);
  console.log("notes table + (user_id, created_at desc) index applied");
} catch (err) {
  console.error("notes migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
