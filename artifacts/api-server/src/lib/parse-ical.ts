// Tiny iCalendar (RFC 5545) reader for Canvas's `/icalendar?token=<PAT>` feed.
//
// Scope — by design, NOT exhaustive RFC 5545:
//   • VCALENDAR with VEVENT blocks only.
//   • Properties whitelisted: UID, DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION.
//   • CRLF line-folding (RFC 5545 §3.1) handled.
//   • DTSTART/DTEND: datetime with trailing `Z` (UTC) or local-naive form like
//     "20260324T103000" — Canvas publishes in UTC so that's the only path we
//     really hit; local-naive dates are persisted as UTC midnights so the
//     DB never swims in ambiguous local times.
//
// Explicitly out of scope:
//   • Recurrence (RRULE / EXDATE / RDATE). Canvas's `feeds/icalendar` feed
//     is single-shot — no expanded recurrence. If a future Canvas instance
//     exposes a multi-event feed, sync will store at most one row per VEVENT
//     and the master event only.
//   • VTIMEZONE blocks / per-property TZID. UTC only.
//   • VALARM / VTODO / VJOURNAL / VFREEBUSY.
//   • Anything else not in the property whitelist is silently dropped,
//     NOT a parse error — Canvas may move to including X-* properties later.
//
// If the feed is unparseable (no `BEGIN:VCALENDAR` / `END:VCALENDAR`) the
// parser throws. The sync layer catches and logs; it never half-stores.

export interface ICalEvent {
  uid: string;
  // Always present — DTSTART is mandatory in VEVENT. Stored as Date.
  start: Date;
  end: Date | null;
  summary: string | null;
  description: string | null;
  location: string | null;
}

/**
 * Parse a complete VCALENDAR document.
 * Throws on missing VCALENDAR envelope or unparseable DTSTART.
 */
export function parseIcal(text: string): ICalEvent[] {
  // Normalise line endings — some servers emit CRLF, others LF.
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Fold long lines: a continuation line starts with a single space/tab.
  // Replace `\n<whitespace>` with empty string so "DESCRIPTION:line one\n
  // line two" becomes "DESCRIPTION:line oneline two".
  const unfolded = normalised.replace(/\n[ \t]/g, "");

  const lines = unfolded.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Determine envelope. Should be exactly:
  //   BEGIN:VCALENDAR
  //   ... content ...
  //   END:VCALENDAR
  // If not, hard error — we explicitly do NOT silently absorb other shapes.
  if (lines[0] !== "BEGIN:VCALENDAR") {
    throw new Error("ical: missing BEGIN:VCALENDAR");
  }
  if (lines.at(-1) !== "END:VCALENDAR") {
    throw new Error("ical: missing END:VCALENDAR");
  }

  const events: ICalEvent[] = [];
  let inEvent = false;
  let current: Partial<ICalEvent> | null = null;

  for (const line of lines.slice(1, -1)) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current && typeof current.uid === "string" && current.start) {
        events.push(finaliseIcalEvent(current));
      }
      current = null;
      inEvent = false;
      continue;
    }
    if (!inEvent || !current) continue;

    // Property lines are "NAME" or "NAME;PARAM=val:VALUE".
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const meta = line.slice(0, colon);
    const value = line.slice(colon + 1);
    // Drop the param segment (after the first ';'). Whitelisted properties
    // here don't actually need params, but Canvas occasionally emits
    // "DTSTART;TZID=America/New_York:20260324T103000" — we treat unknown
    // params as "this is local-naive" and parse the value as-is.
    const name = meta.split(";", 1)[0]!.toUpperCase();

    switch (name) {
      case "UID":
        current.uid = escapeIcal(value);
        break;
      case "DTSTART":
        current.start = parseIcalDate(value);
        break;
      case "DTEND":
        current.end = parseIcalDate(value);
        break;
      case "SUMMARY":
        current.summary = escapeIcal(value);
        break;
      case "DESCRIPTION":
        current.description = escapeIcal(value);
        break;
      case "LOCATION":
        current.location = escapeIcal(value);
        break;
      // Whitelist — anything else is dropped silently.
    }
  }

  return events;
}

// ----- helpers ------------------------------------------------------------

function finaliseIcalEvent(partial: Partial<ICalEvent>): ICalEvent {
  return {
    uid: partial.uid!,
    start: partial.start!,
    end: partial.end ?? null,
    summary: partial.summary ?? null,
    description: partial.description ?? null,
    location: partial.location ?? null,
  };
}

function parseIcalDate(raw: string): Date {
  // Forms seen in Canvas feeds:
  //   20260324T103000Z          (UTC datetime, classic)
  //   20260324T103000           (local-naive datetime)
  //   20260324                  (date-only — declare at 00:00 UTC)
  const trimmed = raw.trim();
  // Date-only YYYYMMDD — pad to the full form so JS Date parses it as UTC midnight.
  if (/^\d{8}$/.test(trimmed)) {
    return new Date(`${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T00:00:00Z`);
  }
  // Datetime with explicit `Z` suffix → append `Z` and parse.
  if (/^\d{8}T\d{6}Z$/.test(trimmed)) {
    return new Date(
      `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T${trimmed.slice(9, 11)}:${trimmed.slice(11, 13)}:${trimmed.slice(13, 15)}Z`,
    );
  }
  // Datetime without `Z` (local-naive) — parse as UTC by appending `Z`. Canvas
  // sometimes strips the `Z` even though the feed is UTC. The data is correct
  // either way; this is the only place we choose a timezone.
  if (/^\d{8}T\d{6}$/.test(trimmed)) {
    return new Date(
      `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T${trimmed.slice(9, 11)}:${trimmed.slice(11, 13)}:${trimmed.slice(13, 15)}Z`,
    );
  }
  throw new Error(`ical: bad DTSTART/DTEND value: ${raw}`);
}

// Reverse the escape sequences that iCal producers emit. Canvas adds a backslash
// then char for `,`, `;`, `\`, and `\n`. We never need to re-escape back, so
// a full revert is enough.
function escapeIcal(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// ponytail: runnable smoke test. invoke via:
//   node --import tsx artifacts/api-server/src/lib/parse-ical.ts
// Catches the most embarrassing regressions (off-by-one date slice, missing
// line-fold support, dropped escape revert) without dragging vitest in here.
export function demo(): void {
  const sample = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Canvas//EN",
    "BEGIN:VEVENT",
    "UID:course-99-assignment-12345@example.instructure.com",
    "DTSTAMP:20260601T000000Z",
    "DTSTART:20260625T103000Z",
    "DTEND:20260625T113000Z",
    "SUMMARY:Discussion: lab notebook",
    "DESCRIPTION:Line one\\nline two\\, escaped",
    "LOCATION:Room 12",
    "END:VEVENT",
    // Continuation-line property (RFC 5545 §3.1). Must fold correctly.
    "BEGIN:VEVENT",
    "UID:second-event@x",
    "DTSTART:20260626",
    "SUMMARY:Chapter 5\\, continued",
    "DESCRIPTION:Short description that is folded across two lines right",
    "  here",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const events = parseIcal(sample);
  assertEq(events.length, 2, "expected two events");
  assertEq(events[0]!.uid, "course-99-assignment-12345@example.instructure.com", "uid[0]");
  assertEq(events[0]!.summary, "Discussion: lab notebook", "summary[0]");
  assertEq(events[0]!.description, "Line one\nline two, escaped", "description[0] escapes");
  assertEq(events[0]!.location, "Room 12", "location[0]");
  assertEq(events[0]!.start.toISOString(), "2026-06-25T10:30:00.000Z", "start[0] Z-form");
  assertEq(events[0]!.end?.toISOString(), "2026-06-25T11:30:00.000Z", "end[0] Z-form");
  // Date-only form should be 00:00 UTC.
  assertEq(events[1]!.start.toISOString(), "2026-06-26T00:00:00.000Z", "start[1] date-only");
  assertEq(events[1]!.summary, "Chapter 5, continued", "summary[1] comma escape");
  // Continuation-line must join cleanly across line boundaries.
  assertEq(
    events[1]!.description,
    "Short description that is folded across two lines right here",
    "description[1] line-fold",
  );

  // Missing VCALENDAR envelope is a hard error, not a silent pass.
  let threw = false;
  try { parseIcal("BEGIN:VEVENT\nEND:VEVENT\n"); } catch { threw = true; }
  assert(threw, "missing VCALENDAR envelope must error");

  console.log("parse-ical demo ok (2 events parsed, 1 envelope rejection)");
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`parse-ical demo: ${label}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`parse-ical demo: ${label}`);
}

// Run on direct invocation (`node --import tsx parse-ical.ts`). esbuild
// bundles this away in the api-server build because the assignment is
// inside a function that no other module calls.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`;
  } catch {
    return false;
  }
})();
if (invokedDirectly) demo();
