// Probe Supabase from this box, mirroring how the api-server connects.
// node will resolve `pg` from this file's directory (lib/db declares it).
// usage: node probe-pg.mjs "<postgres url>" [--no-tls]
import pg from "pg";

const url = process.argv.find((a) => a.startsWith("postgres"));
if (!url) { console.error("usage: node probe-pg.mjs <url> [--no-tls]"); process.exit(2); }
const noTls = process.argv.includes("--no-tls");

const mask = (s) => s.replace(/:[^:@/]+@/, ":***@");
console.log("URL:", mask(url), noTls ? "(no-tls)" : "(sslmode=require)");

async function attempt(label, client) {
  const t0 = Date.now();
  try {
    await client.connect();
    const r = await client.query("select current_database() db, current_user usr, version() v");
    let tables = [];
    try {
      const t = await client.query(
        "select table_name from information_schema.tables where table_schema='public' order by 1",
      );
      tables = t.rows.map((x) => x.table_name);
    } catch {}
    console.log(`[${label}] OK in ${Date.now() - t0}ms  db=${r.rows[0].db} user=${r.rows[0].usr}`);
    console.log(`  version: ${r.rows[0].v.split("(")[0].trim()}`);
    console.log(`  public tables (${tables.length}): ${tables.join(", ") || "(none — migrations not applied)"}`);
    return true;
  } catch (e) {
    console.log(`[${label}] FAIL in ${Date.now() - t0}ms: ${e.code || ""} ${e.message}`);
    return false;
  } finally {
    try { await client.end(); } catch {}
  }
}

// Step A: exactly as the app sends it — pg parses sslmode from the URL.
if (await attempt("bare", new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000, statement_timeout: 5000 })))
  process.exit(0);

// Step B: strip TLS to isolate auth vs TLS.
await attempt(noTls ? "no-tls" : "lax-tls",
  new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000, statement_timeout: 5000, ssl: noTls ? false : { rejectUnauthorized: false } }));
