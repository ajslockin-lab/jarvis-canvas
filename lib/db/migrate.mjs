// Wipe + apply all Drizzle migrations 0000..0008 in order.
// usage: node migrate.mjs "<postgres url>"
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.argv.find((a) => a.startsWith("postgres"));
if (!url) { console.error("usage: node migrate.mjs <url>"); process.exit(2); }

const dir = "C:/Users/sarth/jarvis-deploy/jarvis-canvas/lib/db/drizzle";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
await c.connect();

// --- Phase 1: WIPE all public tables (cascade) -----------------------------
console.log("\n=== WIPE ===");
const t = await c.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
);
if (t.rows.length === 0) console.log("  (no public tables — already clean)");
for (const { tablename } of t.rows) {
  await c.query(`DROP TABLE IF EXISTS "public"."${tablename}" CASCADE`);
  console.log("  dropped:", tablename);
}
// Drop stale default privileges that could survive table drops and reference roles.
// Harmless if none.
try {
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM carvis_app`);
} catch {}
try {
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM carvis_app`);
} catch {}

// --- Phase 2: apply 0000..0008 ---------------------------------------------
console.log("\n=== APPLY ===");
let ok = 0, fail = 0;
const failed = [];
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  try {
    await c.query(sql);
    console.log("  OK   ", f);
    ok++;
  } catch (e) {
    console.log("  FAIL ", f, "->", e.code || "", e.message.split("\n")[0]);
    fail++;
    failed.push({ f, code: e.code, msg: e.message });
  }
}
console.log(`\n=== summary: ${ok} ok, ${fail} failed ===`);
for (const x of failed) console.log("  failed detail:", x.f, x.code, x.msg.split("\n")[0]);

// --- Phase 3: verify -------------------------------------------------------
const v = await c.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
);
console.log("\nfinal public tables:", v.rows.map((r) => r.tablename).join(", ") || "(none)");

await c.end();
