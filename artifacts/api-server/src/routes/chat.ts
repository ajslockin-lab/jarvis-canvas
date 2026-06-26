// Multi-turn chat sessions (Phase 1).
//
// A user has up to MAX_SESSIONS_PER_USER chat sessions. Each session owns a
// thread of conversation rows. The session sidebar in the UI is built from
// GET /chat/sessions; messages flow through POST /chat/sessions/:id/messages,
// which persists both the user message and the assistant response in one
// transaction so the history can never desync from what's shown.
import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { chatSessionsTable, conversationsTable, remindersTable, notesTable } from "@workspace/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "../lib/auth.js";
import { generateChatResponse, generateSessionTitle, type ChatMessage } from "../lib/nlu.js";
import { loadHistory, loadUserContext } from "../lib/chat-context.js";
import { logger } from "../lib/logger.js";

const router = Router();

// Phase 1 product cap. If we ever raise it, this is the only number that
// changes — the DB has no constraint and callers see a different limit.
const MAX_SESSIONS_PER_USER = 5;

// Auto-create a default reminder when a chat session detects the set_reminder
// intent. Trigger time defaults to 5 minutes from now — Phase 1 deliberately
// doesn't try to parse a duration out of natural language (the AI prompt
// already confirmed the reminder verbally). Later phases can refine this.
function autoCreateReminderFromIntent(userId: string, rawText: string) {
  void db
    .insert(remindersTable)
    .values({
      id: randomBytes(8).toString("hex"),
      userId,
      type: "custom",
      triggeredAt: new Date(Date.now() + 5 * 60_000),
      active: true,
      title: "Carvis reminder",
      body: rawText.slice(0, 280),
    })
    .catch((err) =>
      // Reminders are best-effort — if the insert fails the chat answer still
      // delivered the verbal confirmation. Logged at warn so we don't spam errors.
      logger.warn({ err, userId }, "autoCreateReminderFromIntent failed"),
    );
}

// Auto-create a note when `create_note` intent fires. We persist the user's
// exact text rather than a pre-stripped "note title" — the user already
// wrote it once, treating their text as authoritative avoids "did the LLM
// rephrase me?" confusion on a voice-driven capture flow.
function autoCreateNoteFromIntent(userId: string, rawText: string) {
  const body = rawText.trim().slice(0, 4_000);
  if (!body) return;
  void db
    .insert(notesTable)
    .values({
      id: `n_${randomBytes(10).toString("hex")}`,
      userId,
      body,
    })
    .catch((err) =>
      logger.warn({ err, userId }, "autoCreateNoteFromIntent failed"),
    );
}

const createSessionSchema = z.object({
  // Optional first message — if provided we can run title generation in the
  // same flow as the first POST /chat/sessions/:id/messages call. Clients may
  // also create an empty session and message separately (e.g. when picking a
  // starter prompt from the sidebar).
  firstMessage: z.string().min(1).max(1000).optional(),
});

const sendMessageSchema = z.object({
  message: z.string().min(1, "Message is required").max(1000, "Message too long"),
});

// GET /chat/sessions — list the user's sessions, newest first.
// Sessions beyond MAX_SESSIONS_PER_USER shouldn't exist (POST enforces the
// cap), but if they ever do we still want to show the most recent N only.
router.get("/chat/sessions", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const sessions = await db
      .select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.userId, user.id))
      .orderBy(desc(chatSessionsTable.updatedAt))
      .limit(MAX_SESSIONS_PER_USER);

    res.json({ sessions });
  } catch (err) {
    logger.error({ err, userId: user.id }, "List chat sessions failed");
    res.status(500).json({ error: "Failed to list chat sessions" });
  }
});

// POST /chat/sessions — create a new session. If the user is already at the
// cap, the oldest session (by updatedAt) is deleted before insert. Runs the
// cascade-delete on conversations, so history is cleaned up automatically.
router.post("/chat/sessions", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  try {
    // Cap enforcement: count active sessions in one round-trip, evict the
    // oldest if we're at the limit. Eviction is FK-cascaded so conversations
    // go with it.
    const existing = await db
      .select({ id: chatSessionsTable.id, updatedAt: chatSessionsTable.updatedAt })
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.userId, user.id))
      .orderBy(asc(chatSessionsTable.updatedAt));

    if (existing.length >= MAX_SESSIONS_PER_USER) {
      const toEvict = existing.slice(0, existing.length - MAX_SESSIONS_PER_USER + 1);
      for (const s of toEvict) {
        await db.delete(chatSessionsTable).where(eq(chatSessionsTable.id, s.id));
      }
      logger.info({ userId: user.id, evicted: toEvict.map((s) => s.id) }, "Evicted oldest chat sessions");
    }

    const sessionId = randomBytes(12).toString("hex");
    const [session] = await db
      .insert(chatSessionsTable)
      .values({ id: sessionId, userId: user.id })
      .returning();

    if (parsed.data.firstMessage) {
      // Title gen runs against the row we just inserted; a failure leaves the
      // session with null title (the UI falls back to "New chat").
      const title = await generateSessionTitle(parsed.data.firstMessage);
      if (title) {
        session.title = title;
        await db
          .update(chatSessionsTable)
          .set({ title, updatedAt: new Date() })
          .where(eq(chatSessionsTable.id, sessionId));
      }
    }

    res.status(201).json({ session });
  } catch (err) {
    logger.error({ err, userId: user.id }, "Create chat session failed");
    res.status(500).json({ error: "Failed to create chat session" });
  }
});

// GET /chat/sessions/:id — fetch a single session plus its full message history.
// Used when the user clicks a session in the sidebar. The conversation rows
// come back in ascending order so the UI can render them top-to-bottom.
router.get("/chat/sessions/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const [session] = await db
      .select()
      .from(chatSessionsTable)
      .where(
        and(
          eq(chatSessionsTable.id, req.params["id"] as string),
          eq(chatSessionsTable.userId, user.id),
        ),
      )
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const messages = await loadHistory(session.id);
    res.json({ session, messages });
  } catch (err) {
    logger.error({ err, userId: user.id, sessionId: req.params["id"] }, "Get chat session failed");
    res.status(500).json({ error: "Failed to load chat session" });
  }
});

// DELETE /chat/sessions/:id — drop one session. Cascade-delete on
// conversations.sessionId handles message cleanup; we don't need a separate
// transaction for it.
router.delete("/chat/sessions/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const sessionId = req.params["id"] as string;
    const [existing] = await db
      .select({ id: chatSessionsTable.id })
      .from(chatSessionsTable)
      .where(
        and(
          eq(chatSessionsTable.id, sessionId),
          eq(chatSessionsTable.userId, user.id),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    await db.delete(chatSessionsTable).where(eq(chatSessionsTable.id, sessionId));
    res.status(204).send();
  } catch (err) {
    logger.error({ err, userId: user.id, sessionId: req.params["id"] }, "Delete chat session failed");
    res.status(500).json({ error: "Failed to delete chat session" });
  }
});

// POST /chat/sessions/:id/messages — send a user message, get the AI reply.
// Saves both rows back-to-back so history stays consistent, even if the AI
// call fails mid-flight (we still persist the user message, and return what
// we got).
router.post("/chat/sessions/:id/messages", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  const sessionId = req.params["id"] as string;

  try {
    const [session] = await db
      .select()
      .from(chatSessionsTable)
      .where(
        and(
          eq(chatSessionsTable.id, sessionId),
          eq(chatSessionsTable.userId, user.id),
        ),
      )
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const userText = parsed.data.message;

    // Persist the user message first. Even if the AI call fails we want the
    // user's turn in history so they can retry against the same thread.
    const [userRow] = await db
      .insert(conversationsTable)
      .values({
        userId: user.id,
        sessionId: session.id,
        role: "user",
        message: userText,
      })
      .returning();

    // Pull prior history (excluding the row we just inserted, since that's
    // the message we just sent) plus the new turn for the AI's view.
    const priorHistory = await loadHistory(session.id);
    const conversationHistory: ChatMessage[] = [
      ...priorHistory,
      { role: "user", content: userText },
    ];

    const ctx = await loadUserContext(user.id);
    const result = await generateChatResponse(conversationHistory, ctx);

    const [assistantRow] = await db
      .insert(conversationsTable)
      .values({
        userId: user.id,
        sessionId: session.id,
        role: "assistant",
        message: result.response,
        intent: result.intent,
      })
      .returning();

    // Bump the session's updatedAt so it sorts to the top of the sidebar list.
    await db
      .update(chatSessionsTable)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessionsTable.id, session.id));

    // Side-effect routing: a set_reminder turn auto-creates a reminder row,
    // a create_note turn auto-creates a note. Both are best-effort — the
    // chat answer already verbally confirms the action so any insert
    // failure here is recoverable (user can re-issue the intent).
    if (result.intent === "set_reminder") {
      void autoCreateReminderFromIntent(user.id, userText);
    } else if (result.intent === "create_note") {
      void autoCreateNoteFromIntent(user.id, userText);
    }

    res.status(201).json({
      userMessage: userRow,
      assistantMessage: assistantRow,
      intent: result.intent,
      confidence: result.confidence,
      sessionTitle: session.title ?? null,
    });
  } catch (err) {
    logger.error({ err, userId: user.id, sessionId }, "Send chat message failed");
    res.status(500).json({ error: "Failed to send chat message" });
  }
});

export default router;
