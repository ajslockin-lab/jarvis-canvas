import pg from "pg";

const url = process.argv.find((a) => a.startsWith("postgres"));
if (!url) { console.error("usage: node inspect-pg.mjs <url>"); process.exit(2); }

const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
await c.connect();

// All public tables + row counts + column lists.
const tables = await c.query(
  `select table_name from information_schema.tables where table_schema='public'
   order by table_name`,
);
console.log(`\n=== ${tables.rows.length} public tables (with columns + row count) ===\n`);
for (const { table_name } of tables.rows) {
  const cols = await c.query(
    `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema='public' and table_name=$1
     order by ordinal_position`,
    [table_name],
  );
  let n = null;
  try {
    const r = await c.query(`select count(*)::bigint as n from "${table_name}"`);
    n = r.rows[0].n;
  } catch (e) { n = `(count err: ${e.message})`; }
  console.log(`■ ${table_name}  [rows: ${n}]`);
  for (const col of cols.rows) {
    const nu = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
    const d = col.column_default ? ` DEFAULT ${col.column_default}` : "";
    console.log(`    ${col.column_name} ${col.data_type} ${nu}${d}`);
  }
  console.log("");
}
await c.end();
