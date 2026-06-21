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
  if (!groqClient && process.env["GROQ_API_KEY"]) {
    try {
      const { default: Groq } = await import("groq-sdk");
      groqClient = new Groq({ apiKey: process.env["GROQ_API_KEY"] }) as any;
    } catch {
      groqClient = null;
    }
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
  context: { assignments?: AssignmentCtx[]; reminders?: ReminderCtx[] }
): Promise<string> {
  const assignments = context.assignments || [];
  const reminders = context.reminders || [];
  const summary = assignments.map((a) => {
    const due = a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "soon";
    return `- ${a.name}${a.courseName ? ` (${a.courseName})` : ""} — due ${due}`;
  }).slice(0, 10);

  const reminderSummary = reminders.map((r) => {
    const when = r.triggeredAt ? new Date(r.triggeredAt).toLocaleDateString() : "soon";
    return `- ${r.type} reminder at ${when}`;
  }).slice(0, 5);

  const groq = await getGroq();
  if (!groq) return fallbackResponse(intent, summary, reminderSummary);

  try {
    const contextParts = [`Intent: ${intent}.`, `Recent assignments:\n${summary.join("\n")}`];
    if (reminderSummary.length > 0) {
      contextParts.push(`Active reminders:\n${reminderSummary.join("\n")}`);
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
    return fallbackResponse(intent, summary, reminderSummary);
  }
}

function fallbackResponse(intent: string, summary: string[], reminderSummary: string[] = []): string {
  switch (intent) {
    case "check_deadlines":
    case "upcoming_assignments":
      if (summary.length === 0) return "You have no assignments due. Great job!";
      return `You have ${summary.length} assignment${summary.length !== 1 ? "s" : ""}: ${summary.slice(0, 3).join("; ")}`;
    case "set_reminder": return "Got it — reminder set!";
    case "study_plan": return "Taking a look at your schedule and helping you plan.";
    case "tutor": return "I'd be happy to help you study! What topic are you working on?";
    default:
      if (reminderSummary.length > 0) {
        return `Hello! I'm JARVIS, your Canvas assistant. You have ${reminderSummary.length} active reminder${reminderSummary.length !== 1 ? "s" : ""}. How can I help?`;
      }
      return "Hello! I'm JARVIS, your Canvas assistant. I can help you check deadlines, set reminders, and plan study time.";
  }
}
