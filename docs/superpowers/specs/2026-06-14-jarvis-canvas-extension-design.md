# JARVIS Canvas Extension — Subsystem Design

## Goal
Transform the existing Next.js JARVIS dashboard into a browser extension that overlays on top of Canvas (gavirtual.instructure.com) as a floating bubble + transparent glass overlay, while fixing data filtering and calendar in the main dashboard.

## Author
- Designer: sarth (high school CS student)
- Review Status: Pending user review

## Background
The current JARVIS app is a Next.js web app with Canvas API sync, Groq AI, and a dark dashboard. The goal is to make it accessible while students are actually in Canvas — as a popup overlay on the Canvas page — while also fixing assignment filtering and calendar in the main app.

## Context
- Canvas domain: gavirtual.instructure.com
- Stack: Next.js 16 + React 19 + Prisma + Groq + Supabase
- Authentication: Personal Canvas token (server-side env var)

## Chapter Dependencies
- Core Next.js JARVIS app (already built)

---

## Key Features & Requirements (Must Have)

1. **Chrome Extension (Manifest V3)**
   - Content script injected on `*://gavirtual.instructure.com/*`
   - Floating bubble bottom-right (48px, glowing cyan, pulsing animation)
   - On click: opens full-screen glass overlay (65% opacity, 12px backdrop-blur)
   - Canvas remains visible behind overlay
   - Close via X button, Escape key, or click outside
   - Overlay served from /iframe/frame route (Next.js static + server)

2. **Overlay Layout (Left-Right-Bottom)**
   - Left: Upcoming Deadlines (sorted, duplicates removed, no past dates)
   - Top-Right Column: Grades (progress bar + letter grade)
   - Bottom Row: AI Chat with microphone button + inputs

3. **Deadlines Filtering (Fix)**
   - Must only show assignments due `>= now()`
   - Must only show `completed === false`
   - Remove any stale demo data after real sync
   - Remove completed assignments from display

4. **Calendar (Functional)**
   - Each day cell shows real assignment dots (colored by urgency: red/amber/cyan)
   - Click a day → list assignments due that day
   - "Today" highlight
   - Navigation: Previous/Next week

## Nice to Have (Will Include)

5. **Extension Options Page**
   - Shortcut key to open/close overlay (default: Shift+J)
   - Toggle bubble visibility
   - Enable/disable specific features

6. **Overlay Smart Position**
   - Remembers last position/size in sessionStorage
   - Semi-transparent when idle (30% opacity), full on hover

## Out of Scope
- Remind/GroupMe integration (future)
- OAuth login (sticking with personal token for now)
- Mobile Chrome extension
- Real-time Canvas push notifications

---

## Visual Design

### Colors
| Token | Hex | Use |
|-------|-----|-----|
| Cyan Primary | #06b6d4 | Borders, highlights, active states |
| Deep Background | #020617 | Overlay base (65% opacity) |
| Glass Panel | rgba(6,182,212,0.05) | Card backgrounds |
| Glass Border | rgba(6,182,212,0.20) | Card borders |
| Text Primary | #e2e8f0 | Headings |
| Text Secondary | #94a3b8 | Body |
| Text Muted | #64748b | Subtext |
| Success | #10b981 | Assignment safe / done |
| Warning | #f59e0b | Assignment soon |
| Danger | #ef4444 | Assignment urgent / overdue |
| Info | #3b82f6 | Links / actions |

### Typography
- Font: Inter (system fallback: -apple-system, sans-serif)
- Headings: 18px / font-weight 600 / letter-spacing 0.05em
- Body: 14px / font-weight 400 / line-height 1.5
- Caption: 12px / font-weight 400 / color muted
- Mono: JetBrains Mono for code / IDs

### Layout
- **Overlay:** fullscreen `position: fixed`, `inset: 0`, `z-index: 2147483647`
- **Left Panel (Deadlines):** `flex: 3`, scrollable
- **Right Panel (Grades):** `flex: 1`, min-width 200px
- **Bottom Panel (AI):** full width, compact height
- **Gap:** 12px panels, 16px padding outer
- **Border-radius:** 10px cards, 12px panels

### Bubble States
- Idle: `40px` circle, `opacity: 0.8`, subtle pulse
- Hover: `scale(1.1)`, brighter glow
- Active (open): hidden

### Animations
- Bubble glow: `box-shadow` pulse 2s infinite
- Overlay open: fade-in 0.3s, scale from 0.98 to 1
- Overlay close: fade-out 0.15s, scale to 0.97
- Cards: `transition: all 0.2s ease-out` on hover

## Interactions

### Bubble
- [Click] → Opens overlay
- [Right-click] → Options menu (if any)

### Overlay
- [Click X button] or [Click outside] or [Esc key] → Close overlay
- [Click assignment card] → Open in Canvas (new tab)

### Deadlines Panel
- [Click assignment row] → Expand details (description, weight, rubric link if available)
- Hover: underline, cursor pointer

### Calendar
- [Click day cell] → Show assignments due that day
- [Click prev/next arrows] → Change week
- Hover: subtle border highlight

### AI Chat
- [Click mic] → Start voice capture, send to `/api/voice/command`
- [Press Enter] → Send typed text
- Response: Groq-generated, streamed or full

## Data Requirements

| Entity | Fields | Source |
|--------|--------|--------|
| Assignment | id, name, description, dueDate, points, url, courseId, completed | Canvas API (sync) |
| Course | id, name, code, color | Canvas API (sync) |
| SyncStatus | userId, lastSync, courseCount | Internal tracking |
| Conversation | id, userId, role, message, intent, createdAt | Prisma DB |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/canvas/sync` | POST | Sync courses + assignments from Canvas |
| `/api/voice/command` | POST | Process voice/text command with Groq |
| `/api/user/data` | GET | Get user's courses + assignments for overlay |
| `/api/iframe/frame` | GET | Serve iframe HTML for Chrome extension (GET) |

## Component Map

```
app/
  extension/
    page.tsx              → Extension landing (instructions)
    iframe-contents.tsx   → Injected iframe content script
  api/
    iframe/
      frame/route.ts      → Serves static HTML for iframe
    user/data/route.ts    → Already exists
    canvas/sync/route.ts  → Already exists (fix filtering)
    voice/command/route.ts → Already exists
components/
  extension/
    Bubble.tsx             → Floating bubble
    Overlay.tsx            → Glass overlay wrapper
    OverlayContent.tsx     → Main layout (deadlines + grades + chat)
    Iframe.tsx             → Iframe component for Next.js
  dashboard/
    Calendar.tsx            → Fix to make functional
    AssignmentCard.tsx      → (reuse)
components/extension/
  ...
```

## Technical Decisions

1. **Content script injection** via Chrome `content_script` at `document_end`, injects `<iframe>` with `src="http://localhost:3000/extension/iframe"`. Uses `chrome.runtime` for bubble toggle messaging.
2. **Iframe isolation** for styles and security. Iframe communicates with parent Canvas page via `window.postMessage` and `chrome.runtime.onMessageExternal`.
3. **Deadlines filtering** at API level to avoid client-side lag. Date filtering also applied in SQL/Prisma.
4. **Token security** — never stored in client JS. Always server-side (env var) or in server-side `session` / cookie.
5. **CORS** for iframe — allow `http://localhost:3000` or deployed domain.
6. **Errors** — API returns `{ error: string }`; UI shows `try...catch` fallback.

## Error Handling

| Scenario | Handling |
|----------|----------|
| Canvas token revoked or invalid | Show "Canvas not connected" in overlay + link to settings |
| API rate limited / 500 | Retry 3x → show "Try again later" message |
| DB connection lost | In-memory cache for 30s, then show "Syncing..." spinner |
| Assignment with no date | Show "TBD" or exclude from deadlines/calendar |
| Groq failure | Show generic fallback response, log error |
| Extension not injected | Gracefully degrade to standalone Next.js app |

## Edge Cases Considered

1. **Past assignments showing** → Filter `dueDate >= now()` at API
2. **Completed assignments** → Filter `completed === false`
3. **Canvas page not loaded** → Content script `run_at: document_end` waits for DOM
4. **User logged out** → Show auth prompt instead of data
5. **Extension installed but not open** → Bubble visible, overlay hidden
6. **Multiple tabs open** → SessionStorage for position, extension-wide `chrome.storage` for options

## Security Considerations

- Canvas token is NEVER in client bundle (env var only)
- CORS policy on API: `Access-Control-Allow-Origin` restricted to iframe origin + extension domain
- Content script only runs on `gavirtual.instructure.com`
- Iframe runs in `sandbox="allow-scripts allow-same-origin"` (not `allow-top-navigation` without caution)
