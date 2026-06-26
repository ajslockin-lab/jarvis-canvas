import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://carvis_app:carvis_app@127.0.0.1:54329/jarvis", application_name: "signin-probe" });
await c.connect();
try {
  // Replicate exactly what the route's drizzle call does.
  const r = await c.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", ["nonexistent@example.com"]);
  console.log("notexist:", JSON.stringify(r.rows));
  const s = await c.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", ["sarthakbagal2311@gmail.com"]);
  console.log("sarthak:", JSON.stringify(s.rows[0], null, 2));
} catch (e) { console.log("error:", e.message); } finally { await c.end(); }
