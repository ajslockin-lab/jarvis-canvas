// apply-security-hardening.mjs — execute 0005_security_hardening.sql against
// the same DATABASE_URL the api server uses. Idempotent so dev.mjs can
// invoke it on every dev restart.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlFile = path.join(root, "drizzle", "0005_security_hardening.sql");

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
  console.log("security hardening applied (extensions, audit triggers, constraints, app role)");
} catch (err) {
  console.error("hardening failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
