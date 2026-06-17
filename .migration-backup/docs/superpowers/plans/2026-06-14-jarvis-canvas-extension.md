# JARVIS Canvas Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that injects a floating cyan bubble + transparent glass overlay on Canvas, fix deadlines filtering, and make the calendar functional.

**Architecture:** Content script injects a floating bubble (floating action button) on Canvas pages. Clicking it opens a fullscreen glass overlay (iframe backed by Next.js `/extension/iframe`). Deadlines and calendar in the main Next.js app are fixed to be fully functional. The extension talks to the existing Next.js API for data same as the web dashboard does.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Prisma, Groq SDK, Chrome Extension Manifest V3

---

## Prerequisites

- [ ] Ensure `.env.local` has `DATABASE_URL`, `GROQ_API_KEY`, `CANVAS_DOMAIN`, `CANVAS_PERSONAL_TOKEN` set
- [ ] Ensure Prisma client is generated (`npx prisma generate`)
- [ ] Dev server running (`npm run dev`)

## Phase 1: Fix Dashboard Data & Calendar (Independent)

These are standalone fixes to the web app, and can be shipped before the extension integration.

### Task 1: Update `/api/user/data` to Filter Deadlines

**Files:**
- Modify: `app/api/user/data/route.ts`

- [ ] **Step 1:** Read the current `app/api/user/data/route.ts`
- [ ] **Step 2:** Update the Prisma `include` to order assignments by dueDate correctly
- [ ] **Step 3:** Add date filter on the server to only return assignments with `dueDate >= now()` and `completed === false`
- [ ] **Step 4:** Test with `curl http://localhost:3000/api/user/data`
- [ ] **Step 5:** Verify no assignments with past dueDate are returned

---

### Task 2: Create Functional Calendar Component

**Files:**
- Create: `components/dashboard/FunctionalCalendar.tsx`
- Modify: `components/dashboard/WeeklyCalendar.tsx` (or replace it)

- [ ] **Step 1:** Create `components/dashboard/FunctionalCalendar.tsx` with the following features:
  - Accept `assignments` prop
  - Show a weekly grid (Sun -> Sat)
  - Each day cell shows dots (red/amber/cyan) for assignments due that day
  - Highlight the current day
  - Clicking a day opens a small tooltip/popover listing the assignments due that day
  - Add `prevWeek`/`nextWeek` navigation buttons
- [ ] **Step 2:** Replace `WeeklyCalendar` import in `components/dashboard/Dashboard.tsx` with `FunctionalCalendar`
- [ ] **Step 3:** Pass real assignments via the `allAssignments` variable to the calendar
- [ ] **Step 4:** Test in browser that the calendar shows real data and navigation works

### Task 3: Fix `assignments` due date sorting & duplicate filtering

**Files:**
- Modify: `components/dashboard/Dashboard.tsx`

- [ ] **Step 1:** In `Dashboard.tsx`, filter the `allAssignments` flatMap to only include `dueDate >= now()` and `completed === false`
- [ ] **Step 2:** Confirm the `upcomingAssignments` shows the correct filtered list
- [ ] **Step 3:** Test in browser

---

## Phase 2: Chrome Extension Shell

### Task 4: Create Chrome Extension Manifest & Content Script

**Files:**
- Create: `chrome-extension/manifest.json`
- Create: `chrome-extension/contentScript.ts`
- Create: `chrome-extension/styles.css`
- Create: `chrome-extension/README.md` (how to load into Chrome)

- [ ] **Step 1:** Write `manifest.json` (Manifest V3) with:
  - `matches: ["*://gavirtual.instructure.com/*"]`
  - `js: ["contentScript.js"]`
  - `css: ["styles.css"]`
  - `permissions: ["activeTab", "storage"]`
- [ ] **Step 2:** Write `contentScript.ts` (compile to `contentScript.js`):
  - Create a `<div id="jarvis-bubble">` fixed bottom-right of the page
  - Attach a glowing pulse animation (CSS class)
  - On click, inject an `<iframe>` pointing to `http://localhost:3000/extension/iframe`
  - the iframe should be fullscreen, transparent, and sit on top of the page
- [ ] **Step 3:** Write `styles.css`:
  - `#jarvis-bubble` styles: 48px, rounded-full, cyan, fixed bottom-right
  - Overlay iframe styles: `position: fixed; inset: 0; z-index: 2147483647; background: transparent; border: none; width: 100vw; height: 100vh;`
  - Close button inside the bubble or overlay
- [ ] **Step 4:** Verify by loading the `chrome-extension` folder into Chrome in developer mode.

### Task 5: Build Iframe Route in Next.js

**Files:**
- Create: `app/extension/iframe/page.tsx`
- Create: `components/extension/OverlayContent.tsx`

- [ ] **Step 1:** Create `app/extension/iframe/page.tsx`. This is a minimal Next.js page served inside the extension's iframe. It should be as self-contained as possible to prevent leaking styles to the host page.
- [ ] **Step 2:** Create `OverlayContent.tsx` with the v2 layout:
  - Top row: `Deadlines` (left, `flex: 3`) and `Grades` (right, `flex: 1`)
  - Bottom row: `AIChat` component with 🎙️ Mic button
  - Overall wrapper uses `bg-black/65 backdrop-blur-xl`
- [ ] **Step 3:** In the iframe page, import `OverlayContent` and use `max-w` and `mx-auto` to center it on the screen, since the iframe itself is already fullscreen.

### Task 6: Grades & Deadlines Components for Overlay

**Files:**
- Create: `components/extension/DeadlinesPanel.tsx`
- Create: `components/extension/GradesPanel.tsx`
- Create: `components/extension/AIChat.tsx`
- Modify: `components/extension/OverlayContent.tsx`

- [ ] **Step 1:** Create `DeadlinesPanel.tsx`: Fetches `/api/user/data`, renders assignment cards sorted by `dueDate`
- [ ] **Step 2:** Create `GradesPanel.tsx`: Renders a list of progress bars for each course grade (hardcode initial dummy data or fetch from Canvas API if available)
- [ ] **Step 3:** Create `AIChat.tsx`:
  - Mic button in the center/bottom
  - Text input or just the mic
  - On voice submit, call `/api/voice/command`
  - Render the returned `response` text
- [ ] **Step 4:** Compose them inside `OverlayContent.tsx` matching the v2 layout

### Task 7: Wire Iframe Message Passing (Optional but Recommended)

**Files:**
- Modify: `chrome-extension/contentScript.ts`
- Modify: `app/extension/iframe/page.tsx`

- [ ] **Step 1:** The `contentScript` can send messages to the iframe via `iframe.contentWindow.postMessage` to toggle visibility, or simply use the iframe `display` property.
- [ ] **Step 2:** Add `Escape` key listener in `contentScript` to send a message to hide the overlay.
- [ ] **Step 3:** Add `shift+J` keyboard shortcut in `chrome-extension/manifest.json` to toggle the overlay.

---

## Summary of New / Modified Files

| New / Modify | File | Purpose |
|--------------|------|---------|
| Modify | `components/dashboard/Dashboard.tsx` | Filter out past/completed assignments |
| Create / Modify | `components/dashboard/FunctionalCalendar.tsx` / `WeeklyCalendar.tsx` | Functional weekly calendar |
| Modify | `app/api/user/data/route.ts` | Return only future/incomplete assignments |
| Create | `app/extension/iframe/page.tsx` | Next.js iframe content route |
| Create | `components/extension/OverlayContent.tsx` | v2 layout composition |
| Create | `components/extension/DeadlinesPanel.tsx` | Deadlines list in iframe |
| Create | `components/extension/GradesPanel.tsx` | Grades bars in iframe |
| Create | `components/extension/AIChat.tsx` | Mic + AI chat in iframe |
| Create | `chrome-extension/manifest.json` | Extension manifest |
| Create | `chrome-extension/contentScript.ts` | Content script for bubble injection |
| Create | `chrome-extension/styles.css` | Content script bubble + overlay styles |
| Modify | `chrome-extension/README.md` | How to build/load the extension |

## Dependencies

- Phase 2 (Extension) depends on Phase 1 fixes (data must be functional before the extension can display it correctly).
- Within Phase 2, Task 6 depends on Task 5 (components must exist before composition).

## Testing Strategy

### Unit / Manual
1. Run `npm run dev` to start the Next.js server.
2. Verify `/api/user/data` returns only upcoming, incomplete assignments.
3. Visit the main app (`/`) — check calendar navigation and day clicks.
4. Visit `/extension/iframe` directly — ensure the layout looks correct.
5. Load the `chrome-extension` folder in Chrome `chrome://extensions/` (Developer mode ON -> Load Unpacked).
6. Visit `gavirtual.instructure.com` and click the bubble.
7. Verify the overlay renders, deadlines are correct, and the mic works.

### API Verification
- `POST /api/canvas/sync` → triggers sync, returns `courseCount`
- `GET /api/user/data` → returns filtered assignments + courses
- `POST /api/voice/command` → accepts `{ text: "..." }` and returns `{ intent, response }`

## Commit Checkpoints

- `feat: filter deadlines to only upcoming/incomplete`
- `feat: add functional calendar with week navigation and assignment dots`
- `feat: create extension iframe route and overlay component`
- `feat: implement DeadlinesPanel, GradesPanel, AIChat`
- `feat: add Chrome extension manifest and content script`
- `feat: wire keyboard shortcuts (Escape, Shift+J)`
