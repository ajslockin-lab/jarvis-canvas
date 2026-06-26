// wipe-db.mjs — truncate all rows from the public schema (keep schema).
// Refuses to run without WIPE=yes to avoid accidental invocation.

import pg from "pg";

if (process.env.WIPE !== "yes") {
  console.error("Refusing to run without WIPE=yes in env.");
  process.exit(2);
}

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@127.0.0.1:54329/jarvis";

const { Client } = pg;
const client = new Client({ connectionString: url });
await client.connect();

try {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  if (rows.length === 0) {
    console.log("no tables in public schema — nothing to wipe");
    process.exit(0);
  }
  const names = rows.map((r) => r.tablename);
  const quoted = names.map((n) => `"${n}"`).join(", ");

  await client.query("BEGIN");
  await client.query(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
  await client.query("COMMIT");

  for (const n of names) {
    const { rows: c } = await client.query(`SELECT count(*)::int AS n FROM "${n}"`);
    console.log(`wiped ${n}: ${c[0].n} rows remaining`);
  }
  console.log("\n✓ done");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("wipe failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
