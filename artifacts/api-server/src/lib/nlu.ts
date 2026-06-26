// Rules-first intent classification for the Canvas LMS voice assistant.
// Deterministic pattern matching runs before any LLM call — this avoids
// misrouting common queries (e.g. "what's due tomorrow" → "tutor") when
// the free-tier Groq model is slow or returns bad results.

interface NLUResult {
  intent: string;
  entities: {
    courseName?: string;
    assignmentName?: string;
    dueDate?: string;
    timeDuration?: string;
  };
  confidence: number;
  rawText: string;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatUserContext {
  assignments?: AssignmentCtx[];
  reminders?: ReminderCtx[];
  grades?: Array<{ courseName: string; currentScore: number | null; letterGrade: string | null }>;
  calendarEvents?: Array<{ sourceId: string; summary: string | null; startAt: Date; endAt: Date | null; location: string | null }>;
  notes?: Array<{ id: string; body: string; createdAt: Date }>;
}

type AssignmentCtx = { id: string; name: string; dueDate: Date | null; courseName?: string };
type ReminderCtx = { id: string; type: string; triggeredAt: Date; active: boolean; assignmentId: string | null };

// --- Deterministic rules (fast, free, always right for common phrases) ---

const INTENT_RULES: Array<{ test: RegExp; intent: string }> = [
  // Deadline / due-date queries
  { test: /\bdue (tomorrow|today|tonight|this week|next week|soon|soon)\b/i, intent: "upcoming_assignments" },
  { test: /\bwhat('s| is) due\b/i, intent: "upcoming_assignments" },
  { test: /\bdeadlines?\b/i, intent: "check_deadlines" },
  { test: /\bwhen is\b.*\bdue\b/i, intent: "check_deadlines" },
  { test: /\bwhat('s| is) coming (up|soon)\b/i, intent: "upcoming_assignments" },
  { test: /\bupcoming\b.*\bassignment/i, intent: "upcoming_assignments" },

  // Grade queries
  { test: /\bmy grade|my score|grade in|check my grade/i, intent: "check_deadlines" },

  // Reminders
  { test: /\bremind me\b/i, intent: "set_reminder" },
  { test: /\bset a reminder\b/i, intent: "set_reminder" },
  { test: /\bremind\b.*\babout\b/i, intent: "set_reminder" },

  // Study / tutoring
  { test: /\bstudy\b/i, intent: "study_plan" },
  { test: /\bhomework help\b/i, intent: "tutor" },
  { test: /\bexplain\b/i, intent: "tutor" },
  { test: /\bhow do i\b/i, intent: "tutor" },
  { test: /\bhelp me (understand|with|learn)\b/i, intent: "tutor" },

  // Social / greeting
  { test: /^(hi|hey|hello|sup|what'?s up)\b/i, intent: "social" },

  // Notes (Phase 4). Patterns:
  //   "note: <text>", "remember this", "jot [this] down", "write [this] down",
  //   "add to my notes". The optional "this" lets phrases like
  //   "jot this down: …" still fire — earlier regex required literal
  //   "jot down" (no "this" in between) which never matched real speech.
  //   Trailing `(?:\W|$)` is so "noted" doesn't fire on its own.
  { test: /\b(jot (?:this )?down|write (?:this )?down|note(?:\b|:)|remember this|add to my notes)(?:\b|:|\s|$)/i, intent: "create_note" },
  { test: /\b(show my notes|my notes|what did i (?:note|write))\b/i, intent: "list_notes" },

  // Calendar (Phase 2 intent — wired here so chat can mention it; full data
  // arrives in Phase 2 once Google OAuth is integrated)
  { test: /\bwhat('s| is) on my calendar\b/i, intent: "calendar_query" },
  { test: /\bwhen is my next (class|meeting|appointment)\b/i, intent: "calendar_query" },
  { test: /\bmy schedule\b/i, intent: "calendar_query" },
  { test: /\bput .* on my calendar\b|schedule .* (tomorrow|tonight|at \d|for)\b/i, intent: "add_event" },

  // Recap / summarize
  { test: /\b(summarize|recap|what did i miss|give me a (summary|recap))\b/i, intent: "summarize" },
];

/**
 * Try deterministic rule matching first. Returns the intent string or null
 * if no rule matched (meaning we should fall back to LLM).
 */
function classifyByRules(text: string): string | null {
  for (const rule of INTENT_RULES) {
    if (rule.test.test(text)) return rule.intent;
  }
  return null;
}

// --- LLM fallback (for ambiguous utterances that rules can't classify) ---

let groqClient: {
  chat: {
    completions: {
      create: (params: {
        messages: { role: string; content: string }[];
        model: string;
        temperature: number;
        max_tokens: number;
      }) => Promise<{ choices: { message: { content: string } }[] }>;
    };
  };
} | null = null;

async function getGroq() {
  if (groqClient) return groqClient;
  if (!process.env["GROQ_API_KEY"]) return null;
  try {
    const { default: Groq } = await import("groq-sdk");
    groqClient = new Groq({ apiKey: process.env["GROQ_API_KEY"] }) as any;
  } catch {
    return null;
  }
  return groqClient;
}

export async function classifyIntent(text: string): Promise<NLUResult> {
  // --- Rules first: deterministic, free, zero latency ---
  const ruleResult = classifyByRules(text);
  if (ruleResult) {
    return { intent: ruleResult, entities: {}, confidence: 1.0, rawText: text };
  }

  // --- LLM second: for ambiguous utterances the rules can't classify ---
  const groq = await getGroq();
  if (!groq) return { intent: "general", entities: {}, confidence: 0, rawText: text };
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            'You are an intent classifier for a Canvas LMS voice assistant. Classify the query into one of: "check_deadlines", "upcoming_assignments", "set_reminder", "study_plan", "tutor", "social", "general". Return ONLY valid JSON: {"intent": "...", "entities": {...}, "confidence": 0.95, "rawText": "..."}. No markdown, no code blocks.',
        },
        { role: "user", content: `Classify this query: "${text}"` },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 384,
    });
    const content = completion.choices[0]?.message?.content || "";
    try {
      const result = JSON.parse(content) as NLUResult;
      return { intent: result.intent || "general", entities: result.entities || {}, confidence: result.confidence || 0.5, rawText: text };
    } catch {
      return { intent: "general", entities: {}, confidence: 0.3, rawText: text };
    }
  } catch {
    return { intent: "general", entities: {}, confidence: 0, rawText: text };
  }
}

export async function generateResponse(
  intent: string,
  entities: NLUResult["entities"],
  context: {
    assignments?: AssignmentCtx[];
    reminders?: ReminderCtx[];
    calendarEvents?: Array<{ sourceId: string; summary: string | null; startAt: Date; endAt: Date | null; location: string | null }>;
    notes?: Array<{ id: string; body: string; createdAt: Date }>;
  }
): Promise<string> {
  const assignments = context.assignments || [];
  const reminders = context.reminders || [];
  const calendar = context.calendarEvents || [];
  const notes = context.notes || [];
  const summary = assignments.map((a) => {
    const due = a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "soon";
    return `- ${a.name}${a.courseName ? ` (${a.courseName})` : ""} — due ${due}`;
  }).slice(0, 10);

  const reminderSummary = reminders.map((r) => {
    const when = r.triggeredAt ? new Date(r.triggeredAt).toLocaleDateString() : "soon";
    return `- ${r.type} reminder at ${when}`;
  }).slice(0, 5);

  const calendarSummary = calendar.slice(0, 10).map((e) => {
    const when = e.startAt ? new Date(e.startAt).toLocaleString() : "soon";
    return `- ${e.summary ?? "(no title)"} — ${when}${e.location ? ` @ ${e.location}` : ""}`;
  });

  const noteSummary = notes.slice(0, 5).map((n) => `- ${n.body}`);

  const groq = await getGroq();
  if (!groq) return fallbackResponse(intent, summary, reminderSummary, calendarSummary, noteSummary);

  try {
    const contextParts = [`Intent: ${intent}.`, `Recent assignments:\n${summary.join("\n")}`];
    if (reminderSummary.length > 0) {
      contextParts.push(`Active reminders:\n${reminderSummary.join("\n")}`);
    }
    if (calendarSummary.length > 0) {
      contextParts.push(`Upcoming calendar events:\n${calendarSummary.join("\n")}`);
    }
    if (noteSummary.length > 0) {
      contextParts.push(`Recent notes:\n${noteSummary.join("\n")}`);
    }
    contextParts.push(`User entities: ${JSON.stringify(entities)}`);

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You are JARVIS, a helpful academic assistant for Canvas students. Respond in a friendly, concise way (1-2 sentences for voice). If the user asks about reminders, reference their active reminders." },
        { role: "user", content: contextParts.join("\n") },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 300,
    });
    return completion.choices[0]?.message?.content || "I'm not sure about that. Could you rephrase?";
  } catch {
    return fallbackResponse(intent, summary, reminderSummary, calendarSummary, noteSummary);
  }
}

function fallbackResponse(
  intent: string,
  summary: string[],
  reminderSummary: string[] = [],
  calendarSummary: string[] = [],
  noteSummary: string[] = [],
): string {
  switch (intent) {
    case "check_deadlines":
    case "upcoming_assignments":
      if (summary.length === 0) return "You have no assignments due. Great job!";
      return `You have ${summary.length} assignment${summary.length !== 1 ? "s" : ""}: ${summary.slice(0, 3).join("; ")}`;
    case "set_reminder": return "Got it — reminder set!";
    case "study_plan": return "Taking a look at your schedule and helping you plan.";
    case "tutor": return "I'd be happy to help you study! What topic are you working on?";
    case "create_note":
      // Phase 4 — chat-side-effect route (chat.ts POST /messages) inserts the
      // row by now. We just confirm the action in this branch.
      return "Got it — saved as a note.";
    case "list_notes":
      if (noteSummary.length === 0) return "You have no notes saved yet.";
      return `You have ${noteSummary.length} note${noteSummary.length !== 1 ? "s" : ""}: ${noteSummary.slice(0, 3).map((n) => n.replace(/^- /, "")).join("; ")}.`;
    case "summarize": return "Here's a quick recap of what's on your plate.";
    case "calendar_query":
      if (calendarSummary.length === 0) {
        return "Your calendar is empty for the next two weeks. Once Canvas publishes events, they'll show up here.";
      }
      return `You have ${calendarSummary.length} event${calendarSummary.length !== 1 ? "s" : ""} in the next two weeks. Next: ${calendarSummary[0]}.`;
    case "add_event":
      // Phase 1/2 don't write to external calendars; we confirm intent only
      // and surface the existing calendar context so the user still gets a
      // helpful answer. Tier 1 (Google OAuth) will replace this stub.
      return `I'll add that to your calendar once Google Calendar is connected. For now, your next events are: ${calendarSummary.slice(0, 3).join("; ") || "none on file"}.`;
    default:
      if (reminderSummary.length > 0) {
        return `Hello! I'm JARVIS, your Canvas assistant. You have ${reminderSummary.length} active reminder${reminderSummary.length !== 1 ? "s" : ""}. How can I help?`;
      }
      return "Hello! I'm JARVIS, your Canvas assistant. I can help you check deadlines, set reminders, and plan study time.";
  }
}

// --- Multi-turn chat (Phase 1) ---
// Same rules-first/LLM architecture as classifyIntent, but instead of returning
// one short single-shot response, it sends the full message history (capped at
// CHAT_CONTEXT_MESSAGES) plus a packed user context block to Groq so the model
// can answer follow-ups like "what about bio?" by referring to a previous turn.

// Cap chosen to stay under llama-3.1-8b-instant's context window after the
// system prompt (~6K tokens for system + context, leaving ~2K for the response).
// 20 short student messages is ~4K tokens, well under that.
const CHAT_CONTEXT_MESSAGES = 20;

function buildChatSystemPrompt(context: ChatUserContext): string {
  const assignments = (context.assignments || []).slice(0, 10).map((a) => {
    const due = a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "soon";
    return `- ${a.name}${a.courseName ? ` (${a.courseName})` : ""} — due ${due}`;
  });
  const reminders = (context.reminders || []).slice(0, 5).map((r) => {
    const when = r.triggeredAt ? new Date(r.triggeredAt).toLocaleDateString() : "soon";
    return `- ${r.type} reminder at ${when}`;
  });
  const grades = (context.grades || []).slice(0, 10).map((g) =>
    `- ${g.courseName}: ${g.currentScore != null ? `${g.currentScore}%` : "n/a"}${g.letterGrade ? ` (${g.letterGrade})` : ""}`
  );
  const calendar = (context.calendarEvents || []).slice(0, 10).map((e) => {
    const when = e.startAt ? new Date(e.startAt).toLocaleString() : "soon";
    return `- ${e.summary ?? "(no title)"} — ${when}${e.location ? ` @ ${e.location}` : ""}`;
  });
  const notes = (context.notes || []).slice(0, 8).map((n) => {
    const when = new Date(n.createdAt).toLocaleString();
    return `- [${when}] ${n.body}`;
  });

  const parts: string[] = [
    "You are JARVIS, a helpful academic assistant for Canvas students. You are having a multi-turn conversation, so reference earlier turns when relevant.",
    "Be friendly, concise (1-3 sentences for voice), and avoid filler like 'Sure!' or 'Of course!' unless it fits naturally.",
  ];
  if (assignments.length) parts.push(`Recent assignments:\n${assignments.join("\n")}`);
  if (reminders.length) parts.push(`Active reminders:\n${reminders.join("\n")}`);
  if (grades.length) parts.push(`Grade summary:\n${grades.join("\n")}`);
  if (calendar.length) parts.push(`Upcoming calendar events:\n${calendar.join("\n")}`);
  if (notes.length) parts.push(`Recent notes:\n${notes.join("\n")}`);
  return parts.join("\n\n");
}

// Trims the message window to the most recent N pairs, but always keeps the
// first system message at index 0 so the context block is preserved across the
// whole transcript.
function trimChatHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= CHAT_CONTEXT_MESSAGES) return messages;
  // Find first non-system message to preserve
  const firstNonSystemIdx = messages.findIndex((m) => m.role !== "system");
  if (firstNonSystemIdx === -1) return messages.slice(-CHAT_CONTEXT_MESSAGES);

  const head = messages.slice(0, firstNonSystemIdx + 1);
  const tail = messages.slice(-CHAT_CONTEXT_MESSAGES);
  // Drop tail entries until the combined length fits the cap
  while (head.length + tail.length > CHAT_CONTEXT_MESSAGES && tail.length > 0) tail.shift();
  return [...head, ...tail];
}

export interface ChatResponse {
  intent: string;
  response: string;
  confidence: number;
}

export async function generateChatResponse(
  history: ChatMessage[],
  context: ChatUserContext
): Promise<ChatResponse> {
  // The latest user message is what we classify for side-effects (e.g.
  // create_note → insert a row, set_reminder → schedule a push).
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const classification = lastUser
    ? await classifyIntent(lastUser.content)
    : { intent: "general", entities: {}, confidence: 0, rawText: "" };

  const systemPrompt = buildChatSystemPrompt(context);
  const trimmed = trimChatHistory([{ role: "system", content: systemPrompt }, ...history]);

  // Build the same summary blocks the LLM gets, so the no-groq fallback
  // path doesn't drop calendar/notes on the floor.
  const calendarSummary = ((context.calendarEvents || []) as Array<{ sourceId: string; summary: string | null; startAt: Date; endAt: Date | null; location: string | null }>).slice(0, 10).map((e) => {
    const when = e.startAt ? new Date(e.startAt).toLocaleString() : "soon";
    return `- ${e.summary ?? "(no title)"} — ${when}${e.location ? ` @ ${e.location}` : ""}`;
  });
  const noteSummary = ((context.notes || []) as Array<{ id: string; body: string; createdAt: Date }>).slice(0, 5).map((n) => `- ${n.body}`);

  const fallback: ChatResponse = {
    intent: classification.intent,
    confidence: classification.confidence,
    response: fallbackResponse(
      classification.intent,
      ((context.assignments || []).slice(0, 10) as AssignmentCtx[]).map((a) => `- ${a.name}`),
      [],
      calendarSummary,
      noteSummary,
    ),
  };

  const groq = await getGroq();
  if (!groq) return fallback;

  try {
    const completion = await groq.chat.completions.create({
      messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 300,
    });
    return {
      intent: classification.intent,
      confidence: classification.confidence,
      response:
        completion.choices[0]?.message?.content ||
        "I'm not sure I caught that — could you rephrase?",
    };
  } catch {
    return fallback;
  }
}

// Short, fast title generation used when a new chat session is created.
// Runs in <500ms even on the 8b model because we cap output to 12 tokens and
// force a strict format ("Title Only"). Failure is non-fatal — the chat UI
// falls back to "New chat" if title is null.
//
// ponytail: when GROQ isn't configured (CI, local dev, free-tier rate limit)
// fall back to a deterministic 3-words-of-the-first-message heuristic so the
// sidebar still has labels instead of "New chat" rows. Bump to LLM only when
// users complain about generic titles.
function fallbackTitle(text: string): string {
  const stop = new Set(["i", "im", "ive", "a", "an", "the", "is", "are", "to", "of", "and", "or", "for", "on", "in", "at", "my", "me", "you"]);
  const words = text
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1 && !stop.has(w));
  const title = words.slice(0, 4).join(" ");
  return title ? title[0].toUpperCase() + title.slice(1) : "New chat";
}

export async function generateSessionTitle(firstUserMessage: string): Promise<string | null> {
  const groq = await getGroq();
  if (!groq) return fallbackTitle(firstUserMessage);
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Generate a 3-5 word title for a chat conversation based on the user's first message. " +
            "Do not use quotes, punctuation, or the word 'chat'. Examples: 'This Week Deadlines', " +
            "'Bio Study Help', 'Reminder Setup'. Return the title only.",
        },
        { role: "user", content: firstUserMessage },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.4,
      max_tokens: 12,
    });
    const title = completion.choices[0]?.message?.content?.trim().replace(/^["'`]+|["'`]+$/g, "");
    if (!title || title.length > 60) return null;
    return title;
  } catch {
    return null;
  }
}
