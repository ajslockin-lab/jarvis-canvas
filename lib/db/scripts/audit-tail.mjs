import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://carvis_app:carvis_app@127.0.0.1:54329/jarvis" });
await c.connect();
try {
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='audit_log' ORDER BY ordinal_position");
  console.log("audit_log columns:", cols.rows.map(r => r.column_name).join(","));
  const recent = await c.query("SELECT * FROM audit_log ORDER BY occurred_at DESC LIMIT 8");
  console.log("audit_log rows: " + recent.rowCount);
  for (const r of recent.rows) console.log(JSON.stringify(r));
} finally {
  await c.end();
}
