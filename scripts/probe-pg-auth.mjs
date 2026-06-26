// Probe pg auth — try a grid of host+user+password combos and report which
// ones pg actually accepts. Output is "OK" or "FAIL: <reason>" per line.
//
// Run with:
//   node scripts/probe-pg-auth.mjs

const HOSTS = ["127.0.0.1", "localhost"];
const CREDS = [
  { user: "postgres",  pw: "password" },
  { user: "postgres",  pw: "postgres" },
  { user: "postgres",  pw: "" },
  { user: "carvis_app", pw: "carvis_app" },
  { user: "carvis_app", pw: "password" },
];

const PORT = 54329;
const DB = "jarvis";

// pg is hoisted by pnpm into the virtual store but not always to the workspace
// root; resolve from the deep path so this script works regardless of hoisting.
const libPath = new URL(
  "../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js",
  import.meta.url,
).href;
const pg = (await import(libPath)).default;
const { Client } = pg;

for (const host of HOSTS) {
  for (const { user, pw } of CREDS) {
    const url = `postgresql://${user}:${pw}@${host}:${PORT}/${DB}`;
    const c = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    try {
      await c.connect();
      const r = await c.query("SELECT current_user, current_database()");
      console.log(`OK   ${user}@${host} → ${JSON.stringify(r.rows[0])}`);
      await c.end();
    } catch (e) {
      const short = e.message.split("\n")[0].slice(0, 90);
      console.log(`FAIL ${user}@${host} → ${short}`);
      try { await c.end(); } catch {}
    }
  }
}
