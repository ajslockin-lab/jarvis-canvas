// Bootstrap: provision the carvis_app role + grants so lib/db's carvis_app
// rewrite works for any client (including scripts that connect without going
// through the api-server's connectionString() helper).
//
// Safe to re-run: every statement is IF NOT EXISTS-guarded.
//
// Run with:
//   node scripts/bootstrap-carvis-app-role.mjs
// pg is hoisted by pnpm into the virtual store but not always to the workspace
// root; resolve from the deep path so this script works regardless of hoisting.
const pg = (await import(
  new URL("../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js", import.meta.url).href
)).default;

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@localhost:54329/jarvis";

const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carvis_app') THEN
    CREATE ROLE carvis_app LOGIN PASSWORD 'carvis_app';
  END IF;

  ALTER ROLE carvis_app LOGIN PASSWORD 'carvis_app';

  GRANT USAGE ON SCHEMA public TO carvis_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carvis_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carvis_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carvis_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO carvis_app;

  -- statement_timeout mirror (the api-server sets this via application_name+SET)
  ALTER ROLE carvis_app SET statement_timeout = '10s';
  ALTER ROLE carvis_app SET idle_in_transaction_session_timeout = '30s';
END
$$;
`;

const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await c.connect();
  await c.query(sql);
  console.log("OK — carvis_app role provisioned and granted.");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
