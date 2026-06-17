import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

export type NLUIntent =
  | "check_deadlines"
  | "upcoming_assignments"
  | "set_reminder"
  | "study_plan"
  | "tutor"
  | "social"
  | "general"
  | string;

export interface NLUResult {
  intent: NLUIntent;
  entities: {
    courseName?: string;
    assignmentName?: string;
    dueDate?: string;
    timeDuration?: string;
  };
  confidence: number;
  rawText: string;
}

export async function classifyIntent(text: string): Promise<NLUResult> {
  if (!groq) {
    return { intent: "general", entities: {}, confidence: 0, rawText: text };
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            'You are an intent classifier for a Canvas LMS voice assistant. Classify the query into one of: "check_deadlines", "upcoming_assignments", "set_reminder", "study_plan", "tutor", "social", "general". Return ONLY valid JSON: {"intent": "...", "entities": {...}, "confidence": 0.95, "rawText": "..."}. No markdown, no code blocks.',
        },
        {
          role: "user",
          content: `Classify this query: "${text}"`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 384,
    });

    const content = completion.choices[0]?.message?.content || "";
    let result: NLUResult = {
      intent: "general",
      entities: {},
      confidence: 0.5,
      rawText: text,
    };
    try {
      result = JSON.parse(content);
    } catch {
      // Fallback if LLM returns non-JSON
      return { intent: "general", entities: {}, confidence: 0.3, rawText: text };
    }

    return {
      intent: result.intent || "general",
      entities: result.entities || {},
      confidence: result.confidence || 0.5,
      rawText: text,
    };
  } catch (error) {
    console.error("NLU classification error:", error);
    return { intent: "general", entities: {}, confidence: 0, rawText: text };
  }
}

export async function generateResponse(
  intent: string,
  entities: NLUResult["entities"],
  context: { assignments?: { id: string; name: string; dueDate: Date | null; courseName?: string }[]; [key: string]: unknown }
): Promise<string> {
  const assignments = context.assignments || [];
  const summary = assignments.map((a) => {
    const due = a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "soon";
    const course = a.courseName || "";
    return `- ${a.name}${course ? ` (${course})` : ""} — due ${due}`;
  }).slice(0, 10); // limit to 10 to stay within token budget

  if (!groq) {
    return fallbackResponse(intent, summary);
  }

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are JARVIS, a helpful academic assistant for Canvas students. Respond in a friendly, concise way (1-2 sentences for voice).",
        },
        {
          role: "user",
          content: `Intent: ${intent}. Recent assignments:\n${summary.join("\n")}\nUser entities: ${JSON.stringify(entities)}`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content || "I'm not sure about that. Could you rephrase?";
  } catch (error) {
    console.error("Response generation error:", JSON.stringify(error, null, 2));
    return fallbackResponse(intent, summary);
  }
}

function fallbackResponse(
  intent: string,
  summary: string[]
): string {
  switch (intent) {
    case "check_deadlines":
    case "upcoming_assignments": {
      if (summary.length === 0) return "You have no assignments due. Great job!";
      const list = summary.slice(0, 3).join("; ");
      return `You have ${summary.length === 1 ? "1 assignment" : "some assignments"}: ${list}`;
    }
    case "set_reminder":
      return "Got it — reminder set!";
    case "study_plan":
      return "Taking a look at your schedule and helping you plan.";
    case "tutor":
      return "I'd be happy to help you study! What topic are you working on?";
    default:
      return "Hello! I'm JARVIS, your Canvas assistant. I can help you check deadlines, set reminders, and plan study time.";
  }
}
