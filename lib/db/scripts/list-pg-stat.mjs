import pg from "pg";
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:password@127.0.0.1:54329/jarvis",
  application_name: "stat-probe",
});
await c.connect();
try {
  const r = await c.query("SELECT pid, usename::text, application_name::text, client_addr::text, state, age(now(), backend_start)::text AS age FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid");
  console.log("pg_stat_activity rows: " + r.rowCount);
  for (const row of r.rows) console.log(JSON.stringify(row));
} finally {
  await c.end();
}
