#!/usr/bin/env node
// Read-only inspection of the live api-server pool.
import pg from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@127.0.0.1:54329/jarvis";

const c = new pg.Client({ connectionString: url, application_name: "hardening-probe" });
await c.connect();
try {
  const all = await c.query(
    "SELECT pid, usename::text, application_name::text, state, " +
    "  date_trunc('second', backend_start)::text AS started " +
    "FROM pg_stat_activity WHERE datname = current_database() " +
    "ORDER BY application_name, pid",
  );
  console.log("pg_stat_activity:");
  for (const r of all.rows) {
    console.log("  pid=" + r.pid + " user=" + r.usename + " app=" + r.application_name + " state=" + r.state + " started=" + r.started);
  }
  const audit = await c.query(
    "SELECT count(*)::int AS n, max(occurred_at) AS last_occurred FROM audit_log",
  );
  console.log("audit_log:", JSON.stringify(audit.rows[0]));
  const recent = await c.query(
    "SELECT actor_user_id, operation, table_name, row_id, occurred_at FROM audit_log ORDER BY occurred_at DESC LIMIT 5",
  );
  console.log("recent audit entries:");
  for (const r of recent.rows) console.log(JSON.stringify(r));
  const carvisConn = new pg.Client({
    connectionString: url.replace("://postgres:", "://carvis_app:carvis_app@"),
    application_name: "carvis_probe",
  });
  await carvisConn.connect();
  const probe = await carvisConn.query(
    "SELECT current_user::text AS u, (SELECT count(*) FROM users)::int AS users_seen",
  );
  console.log("carvis_app sees:", JSON.stringify(probe.rows[0]));
  await carvisConn.end();
} finally {
  await c.end();
}
