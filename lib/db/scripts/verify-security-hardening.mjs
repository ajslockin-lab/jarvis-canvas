#!/usr/bin/env node
// Verify Phase A DB hardening — read-only probe of the live Postgres.
import { Client } from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@127.0.0.1:54329/jarvis";

const c = new Client({ connectionString: url, application_name: "hardening-verify" });
await c.connect();
try {
  const role = await c.query(
    "SELECT count(*)::int AS c FROM pg_roles WHERE rolname='carvis_app'"
  );
  const trigs = await c.query(
    `SELECT event_object_table::text AS tbl, trigger_name
       FROM information_schema.triggers
      WHERE trigger_name LIKE '%_audit'
      ORDER BY 1, 2`
  );
  const constraints = await c.query(
    `SELECT conrelid::regclass::text AS tbl, conname
       FROM pg_constraint
      WHERE contype='c' AND conname LIKE '%_chk'
      ORDER BY 1, 2`
  );
  const auditColumns = await c.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_name='audit_log'
      ORDER BY ordinal_position`
  );
  const exts = await c.query(
    `SELECT extname FROM pg_extension
      WHERE extname IN ('pgcrypto','citext')
      ORDER BY 1`
  );

  console.log("carvis_app role:", role.rows[0].c);
  console.log("extensions:", exts.rows.map((r) => r.extname).join(", "));
  console.log("audit_log columns:", auditColumns.rowCount);
  console.log("audit triggers:", trigs.rowCount);
  console.log("check constraints:", constraints.rowCount);
  for (const r of trigs.rows) console.log("  trig:", r.tbl, "-", r.trigger_name);
  for (const r of constraints.rows) console.log("  chk :", r.tbl, "-", r.conname);
} finally {
  await c.end();
}
