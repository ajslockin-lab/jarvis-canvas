// Single-user calendar sync. Pulls Canvas's iCal feed at
// `<canvasBase>/icalendar?token=<PAT>`, parses it, and reconciles against
// the `calendar_events` table by (userId, sourceId=UID).
//
// Failure model: every external call is wrapped in a try/catch with a
// best-effort warn log. The sync-scheduler tick calls this last; if we
// fail the user still has fresh courses / assignments / grades.
//
// Comparison strategy: parse → set of source-ids in payload. Anything in
// the DB that's not in that set for this user is deleted. Anything that
// is in the payload but not the DB is inserted. Anything in both is
// updated in place. This is the same shape as the courses/assignments
// diff in sync-scheduler.ts — repeated per-uid try/upsert catch.

import { db } from "@workspace/db";
import { calendarEventsTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { parseIcal, type ICalEvent } from "./parse-ical.js";

const FEED_TIMEOUT_MS = 8_000;

export interface CalendarSyncResult {
  synced: number;
  inserted: number;
  updated: number;
  removed: number;
  errors: string[];
}

/**
 * Sync one user's calendar. Returns counts so the dashboard's first-run UX
 * (lastSyncPhase) can show progress.
 */
export async function syncUserCalendar(
  user: { id: string; canvasBaseUrl: string },
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = { synced: 0, inserted: 0, updated: 0, removed: 0, errors: [] };
  const base = user.canvasBaseUrl.replace(/\/+$/, "");

  let text: string;
  try {
    text = await fetchIcal(base, token, fetchImpl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId: user.id, err: msg }, "calendar sync: iCal fetch failed");
    result.errors.push(`fetch: ${msg}`);
    return result;
  }

  let events: ICalEvent[];
  try {
    events = parseIcal(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId: user.id, err: msg }, "calendar sync: iCal parse failed");
    result.errors.push(`parse: ${msg}`);
    return result;
  }

  // Reconcile. Ponytail: one INSERT + an inArray(...).UPDATE + a NOT-IN
  // DELETE is fewer round-trips than per-row try/upsert the way
  // sync-scheduler.ts does it. We can afford that simplicity here because
  // VCALENDAR payloads are bounded (few hundred events max).
  const incomingIds = new Set(events.map((e) => e.uid));

  // Existing sourceIds for this user — full snapshot to compute the diff.
  const existing = await db
    .select({ id: calendarEventsTable.id, sourceId: calendarEventsTable.sourceId })
    .from(calendarEventsTable)
    .where(eq(calendarEventsTable.userId, user.id));
  const existingById = new Map(existing.map((r) => [r.sourceId, r.id]));
  const incomingIdArr = Array.from(incomingIds);

  // Inserts + updates
  for (const ev of events) {
    const scopedId = `${user.id}__cev_${ev.uid}`;
    const row = {
      id: scopedId,
      userId: user.id,
      sourceId: ev.uid,
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      startAt: ev.start,
      endAt: ev.end,
      lastSyncedAt: new Date(),
    };
    if (existingById.has(ev.uid)) {
      await db.update(calendarEventsTable).set(row).where(eq(calendarEventsTable.id, scopedId));
      result.updated++;
    } else {
      await db.insert(calendarEventsTable).values(row);
      result.inserted++;
    }
    result.synced++;
  }

  // Removals: rows we know about but the latest payload didn't return.
  const staleIds = existing
    .filter((r) => !incomingIds.has(r.sourceId))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await db
      .delete(calendarEventsTable)
      .where(and(eq(calendarEventsTable.userId, user.id), inArray(calendarEventsTable.id, staleIds)));
    result.removed = staleIds.length;
  }

  // Touch lastSyncedAt on existing rows that ARE in the incoming payload
  // so the next scheduler tick can compare them for staleness-aware
  // upserts later. (Currently we always upsert, but this keeps the schema
  // honest if we ever short-circuit.)
  if (incomingIdArr.length > 0) {
    await db
      .update(calendarEventsTable)
      .set({ lastSyncedAt: new Date() })
      .where(
        and(
          eq(calendarEventsTable.userId, user.id),
          inArray(calendarEventsTable.sourceId, incomingIdArr),
        ),
      );
  }

  logger.info(
    { userId: user.id, ...result },
    "calendar sync done",
  );
  return result;
}

async function fetchIcal(base: string, token: string, fetchImpl: typeof fetch): Promise<string> {
  // Canvas requires token in the query string of /icalendar. We never log
  // this URL or persist it; it's rebuilt fresh inside the AbortController
  // lifetime and discarded on resolve / reject.
  const url = `${base}/icalendar?token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.5" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`ical feed returned ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
