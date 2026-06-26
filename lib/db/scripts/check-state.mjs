import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://postgres:password@127.0.0.1:54329/jarvis" });
await c.connect();
try {
  const r = await c.query("SELECT count(*)::int AS n FROM users");
  console.log("users count:", JSON.stringify(r.rows[0]));
  const audit = await c.query("SELECT count(*)::int AS n, max(occurred_at) AS last FROM audit_log");
  console.log("audit_log summary:", JSON.stringify(audit.rows[0]));
  const recent = await c.query("SELECT actor_user_id, operation, table_name, occurred_at FROM audit_log ORDER BY occurred_at DESC LIMIT 5");
  console.log("recent audit entries:");
  for (const row of recent.rows) console.log(JSON.stringify(row));
} finally {
  await c.end();
}
