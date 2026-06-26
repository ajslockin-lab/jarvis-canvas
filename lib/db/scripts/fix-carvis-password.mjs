import pg from "pg";
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:password@127.0.0.1:54329/jarvis",
  application_name: "carvis_role_probe",
});
await c.connect();
try {
  const r = await c.query(
    "SELECT rolname, rolpassword IS NOT NULL AS has_pw, " +
      "rolcanlogin, rolsuper, rolcreatedb, rolcreaterole " +
      "FROM pg_roles WHERE rolname = 'carvis_app'",
  );
  console.log("pg_roles row:", JSON.stringify(r.rows[0]));

  // Force-set password to 'carvis_app' so we have a known state. Idempotent.
  await c.query("ALTER ROLE carvis_app WITH LOGIN PASSWORD 'carvis_app'");
  console.log("ALTER ROLE applied");

  const r2 = await c.query(
    "SELECT rolname, rolpassword IS NOT NULL AS has_pw FROM pg_roles WHERE rolname = 'carvis_app'",
  );
  console.log("after ALTER:", JSON.stringify(r2.rows[0]));

  // Try connecting as carvis_app directly:
  const cc = new pg.Client({
    connectionString:
      "postgresql://carvis_app:carvis_app@127.0.0.1:54329/jarvis",
    application_name: "carvis_self_probe",
  });
  await cc.connect();
  const me = await cc.query(
    "SELECT current_user::text AS u, session_user::text AS s, " +
      "  current_setting('application_name') AS app, " +
      "  current_setting('statement_timeout') AS stmt_to",
  );
  console.log("carvis_app self:", JSON.stringify(me.rows[0]));

  // Confirm role privileges still intact (no need to re-grant if pg_authid survived)
  const privs = await cc.query(
    "SELECT string_agg(privilege_type::text, ',' ORDER BY 1) AS p " +
      "FROM information_schema.role_table_grants " +
      "WHERE grantee = 'carvis_app' AND table_schema='public' AND table_name='users'",
  );
  console.log("carvis_app user privs:", JSON.stringify(privs.rows[0]));

  await cc.end();
} finally {
  await c.end();
}
