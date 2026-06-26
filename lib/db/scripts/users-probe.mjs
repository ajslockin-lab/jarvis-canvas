import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://carvis_app:carvis_app@127.0.0.1:54329/jarvis" });
await c.connect();
try {
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position");
  console.log("users columns:", cols.rows.map(r => r.column_name).join(","));
  const t = await c.query("SELECT 1 FROM users LIMIT 1");
  console.log("SELECT 1 FROM users: " + t.rowCount);
  const probe = await c.query("SELECT id, email, password_hash FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1", ["sarthakbagal2311@gmail.com"]);
  console.log("password_hash row:", JSON.stringify(probe.rows[0] ?? null));
  const all = await c.query("SELECT id, email, name, auth_provider, email_verified_at, password_hash IS NULL AS ph_null FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1", ["sarthakbagal2311@gmail.com"]);
  console.log("all cols:", JSON.stringify(all.rows[0] ?? null));
} catch (e) {
  console.error("probe error:", e.message);
} finally {
  await c.end();
}
