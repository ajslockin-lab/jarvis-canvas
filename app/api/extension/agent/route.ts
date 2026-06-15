import { NextRequest, NextResponse } from "next/server";

interface PageElement {
  id: string;
  tag: string;
  text: string;
  ariaLabel?: string;
  placeholder?: string;
  href?: string;
}

interface PageContext {
  url: string;
  title: string;
  visibleText?: string;
  elements: PageElement[];
}

type AgentAction =
  | { type: "click"; elementId: string }
  | { type: "fill"; elementId: string; value: string }
  | { type: "scroll"; direction: "up" | "down" }
  | { type: "navigate"; url: string };

interface AgentPlan {
  response: string;
  action?: AgentAction;
  blocked?: boolean;
}

const NAV_TARGETS: Record<string, string[]> = {
  dashboard: ["dashboard", "home"],
  assignments: ["assignment", "assignments", "homework", "due"],
  grades: ["grade", "grades", "score", "scores"],
  modules: ["module", "modules", "lesson", "lessons"],
  calendar: ["calendar", "schedule"],
  announcements: ["announcement", "announcements"],
  discussions: ["discussion", "discussions"],
  inbox: ["inbox", "message", "messages"],
  courses: ["course", "courses", "class", "classes"],
};

const RISKY_WORDS = [
  "submit",
  "turn in",
  "delete",
  "drop",
  "withdraw",
  "unenroll",
  "take quiz",
  "start quiz",
  "start exam",
  "purchase",
  "pay",
];

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function elementLabel(element: PageElement) {
  return normalize(
    [
      element.text,
      element.ariaLabel,
      element.placeholder,
      element.href,
      element.tag,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function isRisky(command: string) {
  const normalized = normalize(command);
  return RISKY_WORDS.some((word) => normalized.includes(word));
}

function findBestElement(command: string, context: PageContext) {
  const normalizedCommand = normalize(command);
  const tokens = normalizedCommand.split(" ").filter((token) => token.length > 2);
  const elements = context.elements ?? [];

  let best: { element: PageElement; score: number } | null = null;

  for (const element of elements) {
    const label = elementLabel(element);
    if (!label) continue;

    let score = 0;
    for (const token of tokens) {
      if (label.includes(token)) score += token.length;
    }

    if (element.href && (normalizedCommand.includes("open") || normalizedCommand.includes("go"))) {
      score += 2;
    }

    if (!best || score > best.score) {
      best = { element, score };
    }
  }

  return best && best.score >= 4 ? best.element : null;
}

function findNavElement(command: string, context: PageContext) {
  const normalizedCommand = normalize(command);

  for (const [target, aliases] of Object.entries(NAV_TARGETS)) {
    if (!aliases.some((alias) => normalizedCommand.includes(alias))) continue;

    const match = context.elements.find((element) => {
      const label = elementLabel(element);
      return label.includes(target) || aliases.some((alias) => label.includes(alias));
    });

    if (match) return { target, element: match };
  }

  return null;
}

function extractFillValue(command: string) {
  const quoted = command.match(/["']([^"']+)["']/);
  if (quoted?.[1]) return quoted[1];

  const afterWith = command.match(/\b(?:with|for|to)\s+(.+)$/i);
  return afterWith?.[1]?.trim() ?? "";
}

function planAction(command: string, context: PageContext): AgentPlan {
  const normalizedCommand = normalize(command);

  if (isRisky(command)) {
    return {
      blocked: true,
      response:
        "I can help you navigate there, but I will not submit, delete, or start graded work without a confirmation flow.",
    };
  }

  if (normalizedCommand.includes("scroll down")) {
    return { response: "Scrolling down.", action: { type: "scroll", direction: "down" } };
  }

  if (normalizedCommand.includes("scroll up")) {
    return { response: "Scrolling up.", action: { type: "scroll", direction: "up" } };
  }

  const wantsFill =
    normalizedCommand.includes("search") ||
    normalizedCommand.includes("type") ||
    normalizedCommand.includes("enter");

  if (wantsFill) {
    const input = context.elements.find((element) =>
      ["input", "textarea"].includes(element.tag.toLowerCase())
    );
    const value = extractFillValue(command);
    if (input && value) {
      return {
        response: `Typing "${value}" into the page.`,
        action: { type: "fill", elementId: input.id, value },
      };
    }
  }

  const nav = findNavElement(command, context);
  if (nav) {
    return {
      response: `Opening ${nav.target}.`,
      action: { type: "click", elementId: nav.element.id },
    };
  }

  const best = findBestElement(command, context);
  if (best) {
    const label = best.text || best.ariaLabel || best.placeholder || "that item";
    return {
      response: `Opening ${label}.`,
      action: { type: "click", elementId: best.id },
    };
  }

  return {
    response:
      "I can see the Canvas page, but I could not find a matching control to use. Try saying something like open assignments, open grades, or search for algebra.",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const command = typeof body.command === "string" ? body.command : "";
    const pageContext = body.pageContext as PageContext | undefined;

    if (!command || !pageContext || !Array.isArray(pageContext.elements)) {
      return NextResponse.json({ error: "Missing command or page context" }, { status: 400 });
    }

    return NextResponse.json(planAction(command, pageContext));
  } catch (error) {
    console.error("Extension agent error:", error);
    return NextResponse.json({ error: "Agent planning failed" }, { status: 500 });
  }
}
