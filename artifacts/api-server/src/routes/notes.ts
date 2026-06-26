// Notes HTTP surface (Phase 4).
//
// Routes:
//   GET    /api/notes?limit=&before=
//     Auth-protected. Reverse-chron list. `before` is an ISO timestamp
//     cursor; omit for the first page. Default limit 50, hard ceiling 200.
//
//   POST   /api/notes { body }
//     Auth-protected. Single-shot insert.
//
//   DELETE /api/notes/:id
//     Auth-protected, scoped to the authenticated user via WHERE userId.
//
// No PATCH: edits invite "did I really write this?" double-entry anxiety on
// short copy, and the rest of the LLM-driven flows (auto-save from chat)
// already write exactly once. If a user wants to update they delete and
// re-add.

import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { notesTable } from "@workspace/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const MAX_BODY_LEN = 4_000; // 4 KB single-shot, plenty for note-taking.

const createNoteSchema = z.object({
  body: z.string().min(1, "Note body is required").max(MAX_BODY_LEN, "Note too long"),
});

function newNoteId(userId: string): string {
  // Scoped id mirroring the project's other tables: `${prefix}_${hex}`.
  // User scope guarantees we never collide across users without a CHECK.
  const hex = randomBytes(10).toString("hex");
  return `n_${hex}`;
}

// GET /api/notes — reverse-chron, optionally paginated by `before`.
router.get("/notes", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const limitRaw = Number(req.query["limit"]);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(MAX_LIMIT, Math.floor(limitRaw))
      : DEFAULT_LIMIT;

    const beforeRaw = typeof req.query["before"] === "string" ? req.query["before"] : null;
    const before = beforeRaw ? new Date(beforeRaw) : null;

    const filter = before
      ? and(eq(notesTable.userId, user.id), lt(notesTable.createdAt, before))
      : eq(notesTable.userId, user.id);

    const rows = await db
      .select()
      .from(notesTable)
      .where(filter)
      .orderBy(desc(notesTable.createdAt))
      .limit(limit);

    res.json({ notes: rows, next: rows.length === limit ? rows.at(-1)?.createdAt.toISOString() ?? null : null });
  } catch (err) {
    logger.error({ err, userId: user.id }, "GET /api/notes failed");
    res.status(500).json({ error: "Failed to load notes" });
  }
});

// POST /api/notes — insert. Returns the row so the client can prepend it
// to its list without a follow-up GET (no optimistic-update drift).
router.post("/notes", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = createNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  try {
    const id = newNoteId(user.id);
    await db.insert(notesTable).values({
      id,
      userId: user.id,
      body: parsed.data.body,
    });
    const [row] = await db.select().from(notesTable).where(eq(notesTable.id, id)).limit(1);
    res.status(201).json({ note: row });
  } catch (err) {
    logger.error({ err, userId: user.id }, "POST /api/notes failed");
    res.status(500).json({ error: "Failed to save note" });
  }
});

// DELETE /api/notes/:id — scoped to the authenticated user via WHERE;
// a forged id from another user returns 404 (no row matches).
router.delete("/notes/:id", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const id = req.params["id"];
  if (!id) {
    res.status(400).json({ error: "Note id is required" });
    return;
  }

  try {
    const result = await db
      .delete(notesTable)
      .where(and(eq(notesTable.id, id), eq(notesTable.userId, user.id)))
      .returning({ id: notesTable.id });

    if (result.length === 0) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err, userId: user.id, noteId: id }, "DELETE /api/notes/:id failed");
    res.status(500).json({ error: "Failed to delete note" });
  }
});

export default router;
