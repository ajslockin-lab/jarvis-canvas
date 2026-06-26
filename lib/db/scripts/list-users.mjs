import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://postgres:password@127.0.0.1:54329/jarvis" });
await c.connect();
try {
  const u = await c.query("SELECT id::text, email::text, name::text, auth_provider::text, email_verified_at IS NOT NULL AS verified FROM users ORDER BY created_at LIMIT 5");
  console.log("users:");
  for (const r of u.rows) console.log(" ", JSON.stringify(r));
  const audit = await c.query("SELECT count(*)::int AS n, max(occurred_at) AS last FROM audit_log");
  console.log("audit_log summary:", JSON.stringify(audit.rows[0]));
} finally {
  await c.end();
}
