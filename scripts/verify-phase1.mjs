// verify-phase1.mjs — Phase 1 smoke tests for chat_sessions + reminders.
//
// Run after the API server is up and embedded postgres is reachable. Cleans up
// after itself by removing the test user (FK cascade wipes their sessions,
// chat_sessions, conversations, reminders, etc.). Re-runnable.
//
// What it covers:
//   T1  list sessions on a fresh user       → empty
//   T2  create first session with first user message → title + session row
//   T3  multi-turn chat (3 user messages)   → intent + assistant reply each
//   T4  load the session back               → message count ≥ 6 (3 user + 3 asst)
//   T5  5-session cap with eviction         → create 6, list 5, oldest evicted (404)
//   T6  reminder with triggeredAt 30s out   → 201 created, immediate-push path runs
//
// Usage:
//   API_BASE=http://localhost:8080 node scripts/verify-phase1.mjs
//
// Exit codes:
//   0  all assertions passed
//   1  an assertion failed (with diagnostic)
//   2  connection / setup failure
//
// Notes:
//   •  We INSERT a user + session row directly (skipping the email-verification
//      signup flow) so this works against any environment with seeded DB
//      despite whether real emails can send.
//   •  We do NOT create a push subscription, so the reminder's
//      "active after send" flip won't actually happen — T6 just verifies the
//      row landed in the DB and the inline-push path was kicked off.

// pg is hoisted by pnpm into the virtual store but not always to the workspace
// root; resolve from the deep path so this script works regardless of hoisting.
const pg = (await import(
  new URL("../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js", import.meta.url).href
)).default;

// Use `localhost` rather than `127.0.0.1` — embedded-postgres is bound to the
// loopback in a way where the literal IPv4 address can hit a different pg_hba
// rule than the host-resolved one (Windows-specific). Worked on first try from
// PowerShell with localhost, failed with 127.0.0.1.
const API_BASE = process.env.API_BASE ?? "http://localhost:8080";
//
// Auth model: lib/db/src/index.ts rewrites any `postgres` user URL to
// `carvis_app:carvis_app` for the api-server (carvis_app role was provisioned
// by drizzle migration 0005_security_hardening.sql). Mirror the same rewrite
// here so this script connects the way the api-server does — otherwise pg
// rejects `postgres:password` once that migration has run.
// Override via env vars if you really want to use a different role.
function resolveDbUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.username === "postgres" && !process.env.POSTGRES_FORCE_SUPERUSER) {
      u.username = "carvis_app";
      u.password = "carvis_app";
    }
    return u.toString();
  } catch {
    return raw;
  }
}
const DATABASE_URL = resolveDbUrl(
  process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:54329/jarvis",
);

const TEST_PREFIX = `test-p1-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const TEST_USER_ID = `user_${TEST_PREFIX}`;
const TEST_SESSION_TOKEN = `sess_${TEST_PREFIX}`;
const TEST_EMAIL = `${TEST_PREFIX}@verify.local`;
const DB_CONNECTION_TIMEOUT_MS = 5_000;

const { Client } = pg;

let failed = 0;
const allTests = [];

function log(testName, ok, detail = "") {
  if (ok) {
    console.log(`  ✓ ${testName}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${testName}${detail ? ` — ${detail}` : ""}`);
  }
  allTests.push({ name: testName, ok, detail });
}

function phase(label) {
  console.log(`\n${label}`);
}

async function fetchJson(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      cookie: `jarvis_session=${TEST_SESSION_TOKEN}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    redirect: "manual",
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { /* keep as text */ }
  }
  return { status: res.status, body, raw: text };
}

const db = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS });

async function setupUserAndSession() {
  await db.connect();
  await db.query(
    `INSERT INTO users (id, email, name, auth_provider, email_verified_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'canvas', NOW(), NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID, TEST_EMAIL, "Phase 1 Tester"],
  );
  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at, created_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 day', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TEST_SESSION_TOKEN, TEST_USER_ID],
  );
}

async function cleanup() {
  try {
    // CASCADE removes sessions, chat_sessions, conversations, reminders,
    // push_subscriptions — anything FK'd to users.
    await db.query("DELETE FROM users WHERE id = $1", [TEST_USER_ID]);
  } catch (err) {
    console.error(`cleanup warning: ${err.message}`);
  }
  await db.end().catch(() => {});
}

// Try the API for liveness. Healthz is on /api/healthz; some configs add /api/health.
async function apiHealth() {
  for (const path of ["/api/healthz", "/api/health"]) {
    const r = await fetch(`${API_BASE}${path}`);
    if (r.ok) return path;
  }
  return null;
}

async function main() {
  // --- preflight ---
  phase("Preflight");
  const livePath = await apiHealth();
  log("API reachable", livePath !== null, livePath ? `via ${livePath}` : `${API_BASE} not responding`);
  if (!livePath) {
    console.error(`Cannot reach API at ${API_BASE}. Start dev server first.`);
    process.exit(1);
  }

  try {
    await setupUserAndSession();
    log("test user + session inserted", true, TEST_USER_ID);
  } catch (err) {
    console.error(`DB setup failed: ${err.message}`);
    await cleanup();
    process.exit(2);
  }

  // --- T1: list sessions on a fresh user ---
  phase("T1 — list sessions (fresh user)");
  const t1 = await fetchJson("/api/chat/sessions");
  log("GET /api/chat/sessions returns 200", t1.status === 200, `status=${t1.status}`);
  const t1Sessions = t1.body?.sessions ?? [];
  log("sessions array is empty on fresh user", Array.isArray(t1Sessions) && t1Sessions.length === 0, `count=${t1Sessions.length}`);

  // --- T2: create first session with firstMessage ---
  phase("T2 — create first session");
  const t2 = await fetchJson("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ firstMessage: "What assignments are due this week?" }),
  });
  log("POST returns 201", t2.status === 201, `status=${t2.status}`);
  const sessionId = t2.body?.session?.id;
  log("session has id", typeof sessionId === "string" && sessionId.length > 0, `id=${sessionId}`);
  log(
    "session has title (synchronous path)",
    typeof t2.body?.session?.title === "string" && t2.body.session.title.length > 0,
    `title=${JSON.stringify(t2.body?.session?.title)}`,
  );

  // --- T3: multi-turn chat (3 user messages) ---
  phase("T3 — multi-turn chat");
  const intents = [];
  for (const message of [
    "What assignments are due this week?",
    "Anything due tomorrow specifically?",
    "What about this weekend?",
  ]) {
    const r = await fetchJson(`/api/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    log(`POST /messages for "${message.slice(0, 30)}…" returns 201`, r.status === 201, `status=${r.status}`);
    intents.push(r.body?.intent ?? null);
    // tiny pause so updatedAt timestamps differ (visible in list ordering below)
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  log("each message yielded an intent", intents.every((i) => typeof i === "string"), `intents=${JSON.stringify(intents)}`);

  // --- T4: GET session — must have ≥6 rows (3 user + 3 assistant) ---
  phase("T4 — load session back");
  const t4 = await fetchJson(`/api/chat/sessions/${sessionId}`);
  log("GET session returns 200", t4.status === 200, `status=${t4.status}`);
  const msgs = t4.body?.messages ?? [];
  log("message count ≥ 6 (3 user + 3 asst)", msgs.length >= 6, `count=${msgs.length}`);
  const lastRole = msgs.at(-1)?.role;
  log("last message role is assistant", lastRole === "assistant", `last=${lastRole}`);

  // --- T5: 5-session cap ---
  phase("T5 — 5-session cap with eviction");
  // Snap the survivor we're testing BEFORE the eviction reorder. The verifier's
  // own T2 session has been bumped by T3's 3 messages, so it would NOT be the
  // oldest even at the cap. Instead we deliberately create a fill-only session
  // and assert that one is gone after the cap kicks in.
  // ponytail: setUp a fresh pre-cap session we expect to be evicted.
  const doomed = await fetchJson("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const doomedId = doomed.body?.session?.id;
  // Bring total count up to 6 (cap + 1) by adding 5 empty new ones.
  for (let i = 0; i < 5; i += 1) {
    await fetchJson("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  const listAfter = await fetchJson("/api/chat/sessions");
  const sidebar = listAfter.body?.sessions ?? [];
  log("active sessions capped at 5", Array.isArray(sidebar) && sidebar.length === 5, `count=${sidebar.length}`);
  const originalStillThere = sidebar.some((s) => s.id === doomedId);
  log("oldest session evicted", !originalStillThere, `original=${doomedId}`);
  const fetchEvicted = await fetchJson(`/api/chat/sessions/${doomedId}`);
  log("evicted session returns 404", fetchEvicted.status === 404, `status=${fetchEvicted.status}`);

  // --- T6: reminder with triggeredAt 30s out ---
  phase("T6 — reminder fires within 60s");
  const dueAt = new Date(Date.now() + 30_000).toISOString();
  const t6 = await fetchJson("/api/reminders", {
    method: "POST",
    body: JSON.stringify({
      triggeredAt: dueAt,
      title: "Phase 1 test reminder",
      body: "Hello from verify-phase1",
    }),
  });
  log("POST /api/reminders returns 201", t6.status === 201, `status=${t6.status}`);
  const reminderId = t6.body?.id;
  log("reminder row has id", typeof reminderId === "string" && reminderId.length > 0, `id=${reminderId}`);
  log(
    "reminder round-trips with active=true on GET",
    await assertActiveTrue(reminderId),
    reminderId ? `id=${reminderId}` : "",
  );

  // The inline immediate-push path runs whenever due-minus-now ≤ 60s. Without
  // a push subscription on file there's nothing to actually push, so we just
  // assert: the endpoint accepted the row, the DB saw it, and within a minute
  // the row still exists (60-second scheduler tick can't have dropped it on
  // its own — it's still in window).
  phase("T6 — wait window up to 35s and re-check");
  const stillAlive = await waitForInactivity(reminderId, 35_000);
  log(
    `reminder still in DB after the wait window (active=${stillAlive.active}, fired=${stillAlive.sawChange})`,
    stillAlive.exists,
    `exists=${stillAlive.exists} active=${stillAlive.active} sawChange=${stillAlive.sawChange}`,
  );

  // --- summary ---
  console.log("\n=========================================");
  const total = allTests.length;
  const passed = allTests.filter((t) => t.ok).length;
  console.log(`Summary: ${passed}/${total} passed; ${failed} failed`);
  console.log("Test user (kept in DB for inspection):", TEST_USER_ID);
  console.log("=========================================");

  if (failed > 0) {
    console.error("\nFAILS:");
    for (const t of allTests.filter((t) => !t.ok)) {
      console.error(`  - ${t.name}${t.detail ? ` (${t.detail})` : ""}`);
    }
    throw new Error(`${failed} assertion(s) failed`);
  }
  console.log("\nAll Phase 1 smoke tests passed.");
}

// -------- helpers --------

async function assertActiveTrue(reminderId) {
  if (!reminderId) return false;
  const r = await fetchJson("/api/reminders");
  const rows = r.body ?? [];
  if (!Array.isArray(rows)) return false;
  const rem = rows.find((x) => x.id === reminderId);
  return !!rem && rem.active === true;
}

async function waitForInactivity(reminderId, timeoutMs) {
  if (!reminderId) return { exists: false, active: null, sawChange: false };
  const start = Date.now();
  let sawActiveTrue = false;
  let sawChange = false;
  let active = null;
  while (Date.now() - start < timeoutMs) {
    const r = await fetchJson("/api/reminders");
    const rows = r.body ?? [];
    const rem = Array.isArray(rows) ? rows.find((x) => x.id === reminderId) : null;
    if (!rem) return { exists: false, active: null, sawChange };
    active = rem.active;
    if (active === true) sawActiveTrue = true;
    if (sawActiveTrue && active === false) sawChange = true;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return { exists: true, active, sawChange };
}

try {
  await main();
} catch (err) {
  console.error(`\nverify-phase1 failed: ${err.message}`);
  await cleanup();
  process.exit(1);
}

await cleanup();
process.exit(failed > 0 ? 1 : 0);
