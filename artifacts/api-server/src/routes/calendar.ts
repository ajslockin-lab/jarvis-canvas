// Calendar HTTP surface (Phase 2 / Tier 0).
//
// Routes:
//   GET /api/calendar/events?from=&to=
//     Auth-protected. Returns this user's cached events between [from, to].
//     Both query params are optional; absent falls back to "from=now,
//     to=now+14 days" so default callers always get a useful answer.
//
//   POST /api/calendar/sync
//     Auth-protected. Triggers a single-user resync — same code path the
//     scheduler tick uses, just done synchronously for the requesting user.
//     Returns 202 + result counts so the dashboard can render
//     "synced 12 events" copy. 8s iCal timeout is shared with the scheduler.
//
// The two routes are intentionally thin — all logic lives in
// lib/calendar-sync.ts so the scheduler can reuse it without duplication.

import { Router } from "express";
import { db } from "@workspace/db";
import { calendarEventsTable } from "@workspace/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";

import { requireAuth, getCanvasToken } from "../lib/auth.js";
import { syncUserCalendar } from "../lib/calendar-sync.js";
import { logger } from "../lib/logger.js";

const router = Router();

const DEFAULT_LOOKAHEAD_DAYS = 14;
const MAX_LOOKAHEAD_DAYS = 90;

// GET /api/calendar/events — read-only listing for the dashboard. Auth is
// per-user, so the response never crosses users.
router.get("/calendar/events", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const now = new Date();
    const requestedFrom = parseDate(q(req, "from"));
    const requestedTo = parseDate(q(req, "to"));
    const from = requestedFrom ?? now;
    let to = requestedTo ?? new Date(now.getTime() + DEFAULT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    // Cap lookahead so callers don't craft `/calendar/events?to=+10y&` and
    // pull down the entire history. Same idea as Calendar.sync window.
    const cap = new Date(from.getTime() + MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    if (to > cap) to = cap;

    const rows = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.userId, user.id),
          gte(calendarEventsTable.startAt, from),
          lte(calendarEventsTable.startAt, to),
        ),
      )
      .orderBy(asc(calendarEventsTable.startAt));

    res.json({ events: rows, from: from.toISOString(), to: to.toISOString() });
  } catch (err) {
    logger.error({ err, userId: user.id }, "GET /api/calendar/events failed");
    res.status(500).json({ error: "Failed to load events" });
  }
});

// POST /api/calendar/sync — manual pull. Same auth shape as the rest of
// the API; per-user rate limits already protect the endpoint via the
// global /api limiter in app.ts.
router.post("/calendar/sync", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    if (!user.canvasBaseUrl) {
      res.status(409).json({
        error: "Connect Canvas first — your account has no Canvas URL on file",
        code: "canvas_required",
      });
      return;
    }
    const token = await getCanvasToken(user);
    if (!token) {
      res.status(409).json({
        error: "Canvas token expired or missing — sign in again",
        code: "token_required",
      });
      return;
    }

    const result = await syncUserCalendar({ id: user.id, canvasBaseUrl: user.canvasBaseUrl }, token);
    res.status(202).json(result);
  } catch (err) {
    logger.error({ err, userId: user.id }, "POST /api/calendar/sync failed");
    res.status(500).json({ error: "Sync failed" });
  }
});

function q(req: import("express").Request, name: string): string | undefined {
  const v = req.query[name];
  return typeof v === "string" ? v : undefined;
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default router;
