// verify-phase4.mjs — Phase 4 smoke tests for notes (table → /api/notes
// → chat-side-effect create_note → list_notes intent).
//
// Run after the API server is up and embedded postgres reachable. Cleans
// up by removing the test user (FK cascade wipes their notes).
//
// What it covers:
//   T1  GET /api/notes on a fresh user          → empty array
//   T2  POST /api/notes { body }                → 201 + row, GET shows it
//   T3  DELETE /api/notes/:id                   → 204, GET omits it
//   T4  POST validates empty body               → 400
//   T5  chat-side-effect: create_note intent    → row inserted by chat route
//   T6  chat-side-effect: list_notes intent     → response mentions the row
//   T7  pagination cursor works
//
// Usage:
//   API_BASE=http://localhost:8080 node scripts/verify-phase4.mjs

const pg = (await import(
  new URL("../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js", import.meta.url).href
)).default;

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

const API_BASE = process.env.API_BASE ?? "http://localhost:8080";
const TEST_PREFIX = `test-p4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const TEST_USER_ID = `user_${TEST_PREFIX}`;
const TEST_SESSION_TOKEN = `sess_${TEST_PREFIX}`;
const TEST_EMAIL = `${TEST_PREFIX}@verify.local`;
const DB_CONNECTION_TIMEOUT_MS = 5_000;

const { Client } = pg;
let failed = 0;
const allTests = [];

function log(testName, ok, detail = "") {
  if (ok) console.log(`  ✓ ${testName}${detail ? ` — ${detail}` : ""}`);
  else { failed++; console.log(`  ✗ ${testName}${detail ? ` — ${detail}` : ""}`); }
  allTests.push({ name: testName, ok, detail });
}

function phase(label) { console.log(`\n${label}`); }

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
  if (text) { try { body = JSON.parse(text); } catch { /* keep as text */ } }
  return { status: res.status, body, raw: text };
}

const db = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS });

async function setupUserAndSession() {
  await db.connect();
  await db.query(
    `INSERT INTO users (id, email, name, auth_provider, email_verified_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'canvas', NOW(), NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID, TEST_EMAIL, "Phase 4 Tester"],
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
    await db.query("DELETE FROM users WHERE id = $1", [TEST_USER_ID]);
  } catch (err) { console.error(`cleanup warning: ${err.message}`); }
  await db.end().catch(() => {});
}

async function apiHealth() {
  for (const path of ["/api/healthz", "/api/health"]) {
    const r = await fetch(`${API_BASE}${path}`);
    if (r.ok) return path;
  }
  return null;
}

async function waitForNoteByBody(body, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetchJson("/api/notes");
    if (r.body?.notes?.some((n) => n.body === body)) return true;
    await new Promise((res) => setTimeout(res, 50));
  }
  return false;
}

async function main() {
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
    console.error(`setup failed: ${err.message}`);
    await cleanup();
    process.exit(2);
  }

  // ── T1: list on fresh user ──
  phase("T1 — list notes on fresh user");
  const t1 = await fetchJson("/api/notes");
  log("GET /api/notes returns 200", t1.status === 200, `status=${t1.status}`);
  log("notes array is empty on fresh user", Array.isArray(t1.body?.notes) && t1.body.notes.length === 0, `count=${t1.body?.notes?.length ?? "n/a"}`);

  // ── T2: create + see it ──
  phase("T2 — create a note");
  const created = await fetchJson("/api/notes", {
    method: "POST",
    body: JSON.stringify({ body: "Chapter 4 review due Friday" }),
  });
  log("POST returns 201", created.status === 201, `status=${created.status}`);
  log("response carries note row", typeof created.body?.note?.id === "string", `id=${created.body?.note?.id ?? "(none)"}`);
  log("note body matches what was sent", created.body?.note?.body === "Chapter 4 review due Friday", `body=${created.body?.note?.body}`);

  const listed = await fetchJson("/api/notes");
  log("GET /api/notes returns 1 row after create", listed.body?.notes?.length === 1, `count=${listed.body?.notes?.length}`);
  log("listed row body matches", listed.body?.notes?.[0]?.body === "Chapter 4 review due Friday");

  // ── T3: delete ──
  phase("T3 — delete a note");
  const noteId = listed.body.notes[0].id;
  const del = await fetchJson(`/api/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" });
  log("DELETE returns 204", del.status === 204, `status=${del.status}`);
  const afterDelete = await fetchJson("/api/notes");
  log("GET /api/notes is empty after delete", afterDelete.body?.notes?.length === 0, `count=${afterDelete.body?.notes?.length}`);

  // DELETE a non-existent id returns 404
  const delMissing = await fetchJson(`/api/notes/n_does-not-exist`, { method: "DELETE" });
  log("DELETE unknown id returns 404", delMissing.status === 404, `status=${delMissing.status}`);

  // ── T4: empty body / invalid forms rejected ──
  phase("T4 — input validation");
  const emptyBody = await fetchJson("/api/notes", { method: "POST", body: JSON.stringify({ body: "" }) });
  log("POST empty body returns 400", emptyBody.status === 400, `status=${emptyBody.status}`);
  const missingBody = await fetchJson("/api/notes", { method: "POST", body: JSON.stringify({}) });
  log("POST missing body property returns 400", missingBody.status === 400, `status=${missingBody.status}`);

  // ── T5: chat side-effect for create_note ──
  phase("T5 — chat create_note auto-inserts via intent");
  // First create a chat session.
  const sess = await fetchJson("/api/chat/sessions", { method: "POST", body: JSON.stringify({}) });
  const chatSessionId = sess.body?.session?.id;
  log("chat session created", typeof chatSessionId === "string", `id=${chatSessionId ?? "(none)"}`);
  if (typeof chatSessionId === "string") {
    const chatResp = await fetchJson(`/api/chat/sessions/${chatSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: "jot this down: chem test next Tuesday" }),
    });
    log("chat message returns 201", chatResp.status === 201, `status=${chatResp.status}`);
    log("intent is create_note", chatResp.body?.intent === "create_note", `intent=${chatResp.body?.intent}`);

    // Side-effect is fire-and-forget; poll briefly for the row to land.
    const seen = await waitForNoteByBody("jot this down: chem test next Tuesday", 2_000);
    log("note body landed in /api/notes within 2s", seen);
    const listed2 = await fetchJson("/api/notes");
    log("notes list now contains the chat-derived row", listed2.body?.notes?.some((n) => n.body === "jot this down: chem test next Tuesday"));
  }

  // ── T6: chat list_notes intent returns the existing note ──
  phase("T6 — chat list_notes surfaces existing notes");
  // Sanity: confirm the row is still visible via /api/notes before
  // firing the chat turn. If this passes but the chat reply says
  // "no notes saved", then the bug is in loadUserContext, not the DB.
  const beforeChat = await fetchJson("/api/notes");
  log("pre-T6 /api/notes still has the chem-test note",
    beforeChat.body?.notes?.some((n) => n.body === "jot this down: chem test next Tuesday"),
    `count=${beforeChat.body?.notes?.length}`);
  const listSess = await fetchJson("/api/chat/sessions", { method: "POST", body: JSON.stringify({}) });
  const listChatId = listSess.body?.session?.id;
  if (typeof listChatId === "string") {
    const lr = await fetchJson(`/api/chat/sessions/${listChatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: "show my notes" }),
    });
    log("chat list_notes returns 201", lr.status === 201, `status=${lr.status}`);
    log("intent is list_notes", lr.body?.intent === "list_notes", `intent=${lr.body?.intent}`);
    log("assistant reply mentions the chem-test note",
      typeof lr.body?.assistantMessage?.message === "string" &&
      lr.body.assistantMessage.message.includes("chem test"),
      `reply=${lr.body?.assistantMessage?.message?.slice(0, 100) ?? "(none)"}`);
  }

  // ── T7: pagination cursor ──
  phase("T7 — pagination `?limit=` & cursor");
  // Insert 4 more rows so we have 5 notes total minus the chat-inserted one.
  for (let i = 0; i < 4; i += 1) {
    await fetchJson("/api/notes", { method: "POST", body: JSON.stringify({ body: `note ${i}` }) });
    await new Promise((res) => setTimeout(res, 30));
  }
  const page1 = await fetchJson("/api/notes?limit=2");
  log("limit=2 returns 2 rows", page1.body?.notes?.length === 2, `count=${page1.body?.notes?.length}`);
  log("next cursor is set", typeof page1.body?.next === "string", `next=${page1.body?.next}`);
  if (page1.body?.next) {
    const page2 = await fetchJson(`/api/notes?limit=2&before=${encodeURIComponent(page1.body.next)}`);
    log("cursor returns next page", page2.body?.notes?.length >= 1, `count=${page2.body?.notes?.length}`);
    // Older rows from page 1 should not appear in page 2.
    const overlap = page1.body.notes.some((p) => page2.body?.notes?.some((q) => q.id === p.id));
    log("page 1 ids don't repeat on page 2", !overlap);
  }

  console.log(`\n=========================================`);
  console.log(`Summary: ${allTests.filter(t => t.ok).length}/${allTests.length} passed; ${failed} failed`);
  console.log(`Test user (kept in DB for inspection): ${TEST_USER_ID}`);
  console.log(`=========================================`);
  if (failed > 0) {
    console.error("\nFAILS:");
    for (const t of allTests.filter((t) => !t.ok)) console.error(`  - ${t.name} ${t.detail}`);
    process.exit(1);
  }
  console.log("\nAll Phase 4 smoke tests passed.");
  await cleanup();
}

try {
  await main();
} catch (err) {
  console.error("verifier crashed:", err);
  await cleanup();
  process.exit(2);
}
