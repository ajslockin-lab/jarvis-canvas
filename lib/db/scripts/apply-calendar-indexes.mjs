// apply-calendar-indexes.mjs — execute 0006_calendar_events.sql against
// the same DATABASE_URL the api server uses. Idempotent. Sibling of
// apply-security-hardening.mjs but specific to the calendar phase
// (raw index DDL that drizzle-kit push can't express with the table's
// composite PK). Apply once on dev startup alongside the hardening pass.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlFile = path.join(root, "drizzle", "0006_calendar_events.sql");

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
  console.log("calendar_events indexes applied (user_id, source_id unique + user_id, start_at)");
} catch (err) {
  console.error("calendar index migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
