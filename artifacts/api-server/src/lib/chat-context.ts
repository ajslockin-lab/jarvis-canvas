// Shared chat-engine utilities consumed by both routes/chat.ts (HTTP API)
// and routes/voice.ts (voice-command handler when a sessionId is supplied).
//
// Keeping these out of chat.ts avoids the situation where the two routes each
// grow their own near-identical copies of the same loaders — which had
// already been creeping in for Phase 1.
import { db } from "@workspace/db";
import {
  assignmentsTable,
  calendarEventsTable,
  chatSessionsTable,
  conversationsTable,
  coursesTable,
  gradesTable,
  notesTable,
  remindersTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { ChatMessage } from "../lib/nlu.js";

export interface UserContext {
  assignments: { id: string; name: string; dueDate: Date | null; courseName?: string }[];
  reminders: {
    id: string;
    type: string;
    triggeredAt: Date;
    active: boolean;
    assignmentId: string | null;
  }[];
  grades: { courseName: string; currentScore: number | null; letterGrade: string | null }[];
  calendarEvents: {
    sourceId: string;
    summary: string | null;
    startAt: Date;
    endAt: Date | null;
    location: string | null;
  }[];
  notes: { id: string; body: string; createdAt: Date }[];
}

// Pull every user-visible signal we want the AI to know about: courses ->
// in-flight assignments -> active reminders -> grade snapshot.
export async function loadUserContext(userId: string): Promise<UserContext> {
  const now = new Date();
  const courses = await db
    .select({ id: coursesTable.id, name: coursesTable.name })
    .from(coursesTable)
    .where(eq(coursesTable.userId, userId));

  const assignments = (
    await Promise.all(
      courses.map(async (c) => {
        const items = await db
          .select()
          .from(assignmentsTable)
          .where(
            and(
              eq(assignmentsTable.courseId, c.id),
              eq(assignmentsTable.completed, false),
            ),
          );
        return items.map((a) => ({ ...a, courseName: c.name }));
      }),
    )
  )
    .flat()
    .filter((a) => !a.dueDate || a.dueDate >= now);

  const reminders = await db
    .select()
    .from(remindersTable)
    .where(and(eq(remindersTable.userId, userId), eq(remindersTable.active, true)));

  const grades = await db
    .select({
      courseName: coursesTable.name,
      currentScore: gradesTable.currentScore,
      letterGrade: gradesTable.letterGrade,
    })
    .from(gradesTable)
    .innerJoin(coursesTable, eq(gradesTable.courseId, coursesTable.id))
    .where(eq(gradesTable.userId, userId));

  // Calendar: only the next 14 days, ASCENDING. Enough context for "what's
  // on tomorrow / this week / next week" without dumping the user's full
  // calendar into every prompt.
  const calendarEvents = await db
    .select({
      sourceId: calendarEventsTable.sourceId,
      summary: calendarEventsTable.summary,
      startAt: calendarEventsTable.startAt,
      endAt: calendarEventsTable.endAt,
      location: calendarEventsTable.location,
    })
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.userId, userId),
        gte(calendarEventsTable.startAt, now),
      ),
    )
    .orderBy(asc(calendarEventsTable.startAt))
    .limit(20);

  // Notes: most recent 10 newest-first. Chat answers ("list my notes")
  // shouldn't pull the entire history — the dashboard already paginates.
  const notes = await db
    .select({
      id: notesTable.id,
      body: notesTable.body,
      createdAt: notesTable.createdAt,
    })
    .from(notesTable)
    .where(eq(notesTable.userId, userId))
    .orderBy(desc(notesTable.createdAt))
    .limit(10);

  return { assignments, reminders, grades, calendarEvents, notes };
}

// Fetches the prior messages for a session in chronological order, projected
// to the ChatMessage shape the AI prompt expects.
export async function loadHistory(
  sessionId: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.sessionId, sessionId))
    .orderBy(asc(conversationsTable.createdAt), asc(conversationsTable.id))
    .limit(limit);

  return rows.map((r) => ({
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.message,
  }));
}

// Cheap ownership check — used by voice.ts to refuse session ids it doesn't
// own before falling back to the single-shot path.
export async function userOwnsSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: chatSessionsTable.id })
    .from(chatSessionsTable)
    .where(
      and(eq(chatSessionsTable.id, sessionId), eq(chatSessionsTable.userId, userId)),
    )
    .limit(1);
  return Boolean(row);
}
