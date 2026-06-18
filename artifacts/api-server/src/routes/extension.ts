import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { z } from "zod";

const router = Router();

const extensionAgentSchema = z.object({
  command: z.string().min(1, "Command is required"),
  pageContext: z.object({
    url: z.string(),
    title: z.string(),
    elements: z.array(
      z.object({
        id: z.string(),
        tag: z.string(),
        text: z.string(),
        ariaLabel: z.string().optional(),
        placeholder: z.string().optional(),
        href: z.string().optional(),
      })
    ),
  }),
});

type PageElement = { id: string; tag: string; text: string; ariaLabel?: string; placeholder?: string; href?: string };
type PageContext = { url: string; title: string; elements: PageElement[] };
type AgentAction = { type: "click"; elementId: string } | { type: "fill"; elementId: string; value: string } | { type: "scroll"; direction: "up" | "down" } | { type: "navigate"; url: string };
type AgentPlan = { response: string; action?: AgentAction; blocked?: boolean };

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

const RISKY_WORDS = ["submit", "turn in", "delete", "drop", "withdraw", "unenroll", "take quiz", "start quiz", "start exam", "purchase", "pay"];

function normalize(text: string) { return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function elementLabel(el: PageElement) { return normalize([el.text, el.ariaLabel, el.placeholder, el.href, el.tag].filter(Boolean).join(" ")); }
function isRisky(command: string) { const n = normalize(command); return RISKY_WORDS.some((w) => n.includes(w)); }

function findBestElement(command: string, context: PageContext) {
  const tokens = normalize(command).split(" ").filter((t) => t.length > 2);
  let best: { element: PageElement; score: number } | null = null;
  for (const el of context.elements) {
    const label = elementLabel(el);
    if (!label) continue;
    let score = 0;
    for (const token of tokens) { if (label.includes(token)) score += token.length; }
    if (el.href && (command.includes("open") || command.includes("go"))) score += 2;
    if (!best || score > best.score) best = { element: el, score };
  }
  return best && best.score >= 4 ? best.element : null;
}

function findNavElement(command: string, context: PageContext) {
  const nc = normalize(command);
  for (const [target, aliases] of Object.entries(NAV_TARGETS)) {
    if (!aliases.some((a) => nc.includes(a))) continue;
    const match = context.elements.find((el) => { const label = elementLabel(el); return label.includes(target) || aliases.some((a) => label.includes(a)); });
    if (match) return { target, element: match };
  }
  return null;
}

function extractFillValue(command: string) {
  const quoted = command.match(/["']([^"']+)["']/);
  if (quoted?.[1]) return quoted[1];
  return command.match(/\b(?:with|for|to)\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export function planAction(command: string, context: PageContext): AgentPlan {
  const nc = normalize(command);
  if (isRisky(command)) return { blocked: true, response: "I can help you navigate there, but I will not submit, delete, or start graded work without a confirmation flow." };
  if (nc.includes("scroll down")) return { response: "Scrolling down.", action: { type: "scroll", direction: "down" } };
  if (nc.includes("scroll up")) return { response: "Scrolling up.", action: { type: "scroll", direction: "up" } };
  const wantsFill = nc.includes("search") || nc.includes("type") || nc.includes("enter");
  if (wantsFill) {
    const input = context.elements.find((el) => ["input", "textarea"].includes(el.tag.toLowerCase()));
    const value = extractFillValue(command);
    if (input && value) return { response: `Typing "${value}" into the page.`, action: { type: "fill", elementId: input.id, value } };
  }
  const nav = findNavElement(command, context);
  if (nav) return { response: `Opening ${nav.target}.`, action: { type: "click", elementId: nav.element.id } };
  const best = findBestElement(command, context);
  if (best) return { response: `Opening ${best.text || best.ariaLabel || "that item"}.`, action: { type: "click", elementId: best.id } };
  return { response: "I can see the Canvas page, but I could not find a matching control to use. Try saying something like open assignments, open grades, or search for something." };
}

router.post("/extension/agent", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = extensionAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  res.json(planAction(parsed.data.command, parsed.data.pageContext));
});

export default router;
