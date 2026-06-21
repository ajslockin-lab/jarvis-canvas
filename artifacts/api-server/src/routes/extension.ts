import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

const router = Router();

// Explicit allowlist of files shipped in the extension ZIP.
// Prevents accidental inclusion of .env, secrets, node_modules, etc.
const EXTENSION_FILES = [
  "manifest.json",
  "contentScript.js",
  "styles.css",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "icons/icon512.png",
];

// Serve the Chrome extension as a downloadable ZIP.
//
// Requires auth — even though the ZIP contains no secrets, requiring auth
// keeps anonymous recon off the endpoint. The auth check is intentionally
// loose (any signed-in user) so it doesn't couple to Canvas state.
router.get("/extension/download", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const extDir = join(process.cwd(), "artifacts", "chrome-extension");

    // Collect only allowlisted files
    const files: { name: string; data: Buffer }[] = [];
    for (const name of EXTENSION_FILES) {
      const full = join(extDir, name);
      try {
        const data = readFileSync(full);
        files.push({ name, data });
      } catch {
        // Skip missing files gracefully — the allowlist may reference
        // icons that haven't been created yet
        console.warn(`Extension download: skipped missing file ${name}`);
      }
    }

    // Build a ZIP in memory (stored, no compression — small files so size doesn't matter)
    const parts: Buffer[] = [];
    const centralEntries: Buffer[] = [];
    let offset = 0;

    for (const { name, data } of files) {
      const nameBuf = Buffer.from(name, "utf-8");
      // CRC32
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
      crc = (crc ^ 0xFFFFFFFF) >>> 0;

      // Local file header (30 + name + data)
      const local = Buffer.alloc(30 + nameBuf.length + data.length);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(0, 8);  // stored
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(0, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28);
      nameBuf.copy(local, 30);
      data.copy(local, 30 + nameBuf.length);
      parts.push(local);

      // Central directory entry
      const central = Buffer.alloc(46 + nameBuf.length);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0, 8);
      central.writeUInt16LE(0, 10);
      central.writeUInt16LE(0, 12);
      central.writeUInt16LE(0, 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(offset, 42);
      nameBuf.copy(central, 46);
      centralEntries.push(central);

      offset += local.length;
    }

    const centralOffset = offset;
    let centralSize = 0;
    for (const c of centralEntries) centralSize += c.length;

    // End of central directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(centralOffset, 16);
    eocd.writeUInt16LE(0, 20);
    parts.push(...centralEntries, eocd);

    const zip = Buffer.concat(parts);

    // Weak ETag from the concatenated file sizes + count. Same inputs →
    // same ETag, so the client (and a CDN) can 304 it. Weak because we
    // don't hash content — collision risk is acceptable for a stable
    // extension release.
    const etag = `W/"ext-${files.length}-${zip.length}"`;
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="carvis-extension.zip"');
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("ETag", etag);
    res.send(zip);
  } catch (err) {
    console.error("Extension download error:", err);
    res.status(500).json({ error: "Failed to generate extension download" });
  }
});

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

// Levenshtein distance — cheap enough for short sidebar labels.
// Used to score element label quality vs. the user's command tokens.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  // Use two-row DP to save memory — labels are short so space isn't an issue,
  // but the two-row approach is the standard optimization.
  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Fuzzy match scoring: combines exact substring matches with Levenshtein
// distance to rank elements. A label that contains the target word exactly
// scores high; a label that's close (Levenshtein <= 2) still scores positively.
function fuzzyScore(label: string, target: string): number {
  const labelWords = label.split(" ");
  // Exact word match (best signal)
  if (labelWords.includes(target) || label.includes(target)) return 10;
  // Fuzzy: check each word in label vs. target, pick the closest
  let bestDist = Infinity;
  for (const w of labelWords) {
    if (Math.abs(w.length - target.length) > 3) continue; // skip wildly different lengths
    const d = levenshtein(w, target);
    if (d < bestDist) bestDist = d;
  }
  if (bestDist <= 1) return 8;   // 1-char off (e.g. "module" vs "modules")
  if (bestDist <= 2) return 5;   // 2-char off (e.g. "calendar" vs "schedule" hmm no)
  return 0;                      // too far
}

function findBestElement(command: string, context: PageContext) {
  const tokens = normalize(command).split(" ").filter((t) => t.length > 2);
  let best: { element: PageElement; score: number } | null = null;
  for (const el of context.elements) {
    const label = elementLabel(el);
    if (!label) continue;
    let score = 0;
    for (const token of tokens) {
      score += fuzzyScore(label, token);
    }
    if (el.href && (command.includes("open") || command.includes("go"))) score += 3;
    if (el.ariaLabel) score += 1; // aria-label elements are usually the right target
    if (!best || score > best.score) best = { element: el, score };
  }
  return best && best.score >= 5 ? best.element : null;
}

function findNavElement(command: string, context: PageContext) {
  const nc = normalize(command);
  for (const [target, aliases] of Object.entries(NAV_TARGETS)) {
    if (!aliases.some((a) => nc.includes(a))) continue;
    // Score each element by fuzzy match against the target name and aliases.
    // Pick the best-scoring element instead of the first substring match.
    let best: { element: PageElement; score: number } | null = null;
    for (const el of context.elements) {
      const label = elementLabel(el);
      if (!label) continue;
      let score = 0;
      // Direct target match (e.g. command says "assignments" → sidebar "Assignments")
      score += fuzzyScore(label, target);
      for (const alias of aliases) {
        score += fuzzyScore(label, alias);
      }
      // Prefer elements with href (clickable navigation items)
      if (el.href) score += 2;
      // Prefer elements with aria-label (real nav buttons)
      if (el.ariaLabel) score += 2;
      if (!best || score > best.score) best = { element: el, score };
    }
    if (best && best.score >= 5) return { target, element: best.element };
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
