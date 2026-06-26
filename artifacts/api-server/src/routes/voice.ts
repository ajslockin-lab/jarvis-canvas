import { Router } from "express";
import { db } from "@workspace/db";
import {
  chatSessionsTable,
  conversationsTable,
} from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import {
  classifyIntent,
  generateResponse,
  generateChatResponse,
  type ChatMessage,
} from "../lib/nlu.js";
import { loadUserContext, userOwnsSession } from "../lib/chat-context.js";
import { z } from "zod";

const router = Router();

const voiceCommandSchema = z.object({
  text: z.string().min(1, "Text is required").max(1000, "Text too long"),
  // Phase 1: optional session id so voice commands can flow into the same
  // multi-turn thread as /chat. Backward compatible: omit sessionId to keep
  // the legacy single-shot behavior.
  sessionId: z.string().optional(),
});

router.post("/voice/command", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = voiceCommandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  const { text, sessionId } = parsed.data;

  try {
    const ctx = await loadUserContext(user.id);

    // Phase 1: when a sessionId is provided and it belongs to the user, route
    // through the multi-turn chat engine. Mismatched/missing ids fall back to
    // the legacy single-shot path.
    if (sessionId && (await userOwnsSession(user.id, sessionId))) {
      return res.json(await runChatTurn(user.id, sessionId, text, ctx));
    }
    if (sessionId) {
      console.warn(
        `[voice] sessionId ${sessionId} not owned by user ${user.id}, falling back to single-shot`,
      );
    }

    // Legacy single-shot path.
    const nlu = await classifyIntent(text);
    const response = await generateResponse(nlu.intent, nlu.entities, ctx);
    try {
      await db.insert(conversationsTable).values({
        userId: user.id,
        role: "user",
        message: text,
        intent: nlu.intent,
      });
      await db.insert(conversationsTable).values({
        userId: user.id,
        role: "assistant",
        message: response,
      });
    } catch (err) {
      console.warn("Could not save conversation:", err);
    }

    return res.json({ intent: nlu.intent, response, confidence: nlu.confidence });
  } catch (err) {
    console.error("Voice command error:", err);
    return res.status(500).json({ error: "Voice command processing failed" });
  }
});

// Multi-turn turn: load history, call the chat engine, persist both rows,
// bump the session updatedAt. Mirrors routes/chat.ts POST message flow —
// kept inline because the function's argument list is short and the route
// is the only caller.
async function runChatTurn(
  userId: string,
  sessionId: string,
  text: string,
  ctx: Awaited<ReturnType<typeof loadUserContext>>,
) {
  const priorRows = await db
    .select({
      role: conversationsTable.role,
      message: conversationsTable.message,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.sessionId, sessionId))
    .orderBy(asc(conversationsTable.createdAt), asc(conversationsTable.id));
  const history: ChatMessage[] = priorRows.map((r) => ({
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.message,
  }));

  const chat = await generateChatResponse(
    [...history, { role: "user", content: text }],
    ctx,
  );

  await db.insert(conversationsTable).values({
    userId,
    sessionId,
    role: "user",
    message: text,
    intent: chat.intent,
  });
  const [assistantRow] = await db
    .insert(conversationsTable)
    .values({
      userId,
      sessionId,
      role: "assistant",
      message: chat.response,
      intent: chat.intent,
    })
    .returning();

  await db
    .update(chatSessionsTable)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessionsTable.id, sessionId));

  return {
    intent: chat.intent,
    response: chat.response,
    confidence: chat.confidence,
    sessionId,
    conversationId: assistantRow.id,
  };
}

export default router;
