# CARVIS — Canvas Intelligence

> An AI-powered multi-surface assistant for Canvas LMS that lives in a web app, a Chrome extension, and a voice interface — all backed by one Express + Postgres backend.

## The Problem

Canvas LMS is what 30+ million students use for coursework — and its UX is genuinely painful. Deadlines are buried three clicks deep. There's no unified view of what's due across courses. Grades live in a different section than assignments. Students end up manually cross-referencing tabs, setting phone alarms, and guessing at priorities. CARVIS fixes this by connecting directly to Canvas, syncing everything into one place, and giving students a voice-first interface that actually understands their workload.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Student    │────▶│  Web App (Vite   │────▶│  API Server   │
│              │     │  + React + wouter│     │  (Express 5)  │
│              │     └──────────────────┘     │               │
│              │     ┌──────────────────┐     │  ┌─────────┐  │
│              │────▶│  Chrome Extension│     │  │ Drizzle │  │
│              │     │  (Manifest V3)   │     │  │   ORM   │  │
│              │     │  contentScript   │     │  └────┬────┘  │
│              │     │  ↕ postMessage   │     │       │       │
│              │     │  ↕ iframe overlay│     │       ▼       │
└─────────────┘     └──────────────────┘     │  ┌─────────┐  │
                                             │  │ Postgres│  │
                                             │  └─────────┘  │
                                             │               │
                                             │  ┌─────────┐  │
                                             │  │  Groq   │  │
                                             │  │   LLM   │  │
                                             │  └─────────┘  │
                                             └───────┬───────┘
                                                     │
                                             ┌───────▼───────┐
                                             │   Canvas LMS  │
                                             │  (OAuth / PAT)│
                                             └───────────────┘
```

**Three surfaces, one backend:**

| Surface | Stack | Purpose |
|---------|-------|---------|
| Web app | Vite + React 19 + wouter | Dashboard, voice/chat "Jarvis" interface, PWA |
| Chrome extension | Manifest V3 content script | Floating bubble on `*.instructure.com` pages, opens CARVIS in an iframe overlay, executes page actions (click, fill, scroll) via postMessage bridge |
| API server | Express 5 + Drizzle ORM | Canvas OAuth/PAT auth, token encryption (AES-256-GCM), sync, agent planning, NLU classification |

**Shared packages:**

- `@workspace/db` — Drizzle schema (users, courses, assignments, grades, reminders, conversations, sessions), migrations, and Postgres connection pool
- `@workspace/api-spec` — OpenAPI spec + Orval config (in progress)
- `@workspace/api-client-react` — Generated React Query API client (in progress)
- `@workspace/api-zod` — Generated Zod schemas from OpenAPI (in progress)

## Key Design Decisions

### 1. postMessage bridge instead of DOM injection

The Chrome extension uses a `postMessage` bridge between the Canvas page and a cross-origin iframe overlay, rather than injecting React directly into the host page. This is the same technique Canvas's own LTI iframes use — it sidesteps CSP restrictions on `*.instructure.com` that would block injected scripts, and isolates the CARVIS UI from Canvas's DOM (no style leaks, no broken layouts when Canvas updates).

### 2. Scoped IDs to prevent cross-instance collisions

All Canvas-sourced entities use scoped IDs like `userId__c{canvasCourseId}` and `userId__c{canvasCourseId}__a{canvasAssignmentId}`. This means two students on completely different Canvas instances (e.g. `gatech.instructure.com` and `ubc.instructure.com`) can never collide in the same database — even if Canvas assigns them the same internal numeric IDs.

### 3. AES-256-GCM with random IV for token storage

Canvas tokens are encrypted at rest using AES-256-GCM with a random IV per encryption. This isn't AES-CBC (which is vulnerable to padding oracle attacks) — GCM provides authenticated encryption, meaning any tampering with the ciphertext is detected before decryption. The random IV ensures that encrypting the same token twice produces different ciphertext.

## Quickstart

```bash
# 1. Clone and install
git clone https://github.com/ajslockin-lab/jarvis-canvas.git
cd jarvis-canvas
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env — you need:
#   DATABASE_URL (Postgres connection string)
#   ENCRYPTION_KEY (64-char hex for AES-GCM)
#   GROQ_API_KEY (free tier at groq.com)

# 3. Run everything
pnpm dev
# Starts Postgres + API server + Vite frontend in one command.
# Open http://localhost:20034
```

## How It Works (the data flow)

1. **Sign-in** — User provides their Canvas school URL + Personal Access Token (PAT) or goes through OAuth. The PAT is validated against `${canvasUrl}/api/v1/users/self`. The token is AES-256-GCM-encrypted before storage and a 30-day `httpOnly` session cookie is set.

2. **Sync** — Server pulls courses → assignments → enrollments/grades from Canvas, stores everything in Postgres under scoped IDs. Grade-fetch failures are non-fatal (some schools have broken grade endpoints).

3. **Chat/voice** — NLU classifies intent via deterministic rules first (e.g. "due tomorrow" → `upcoming_assignments`), then falls back to Groq's `llama-3.1-8b-instant` for ambiguous utterances. Routes to local DB queries for known intents, or LLM for free-form responses. Degrades to a hardcoded fallback if Groq fails.

4. **Extension overlay** — Content script runs on `*.instructure.com`, collects up to 250 page elements with stable `data-carvis-ids`, opens the app in a cross-origin iframe overlay. User commands like "open assignments" go to `POST /api/extension/agent`, which pattern-matches against nav targets and returns `{ response, action }` for the content script to execute. Risky actions (submit, delete, withdraw) are blocked with a confirmation-requirement message.

## Deployment

| Service | Status | Notes |
|---------|--------|-------|
| Web app | Development | Runs locally via `pnpm dev` |
| API server | Development | Express 5 on port 3000 |
| Chrome extension | Side-load | Download from `/api/extension/download` |
| Database | Local Postgres | Embedded Postgres for dev; production should use managed Postgres |

## Project Structure

```
jarvis-canvas/
├── artifacts/
│   ├── api-server/          # Express 5 backend (routes, lib, Drizzle)
│   ├── chrome-extension/    # Manifest V3 extension (contentScript, icons)
│   ├── jarvis-canvas/       # Vite + React 19 frontend (pages, components, lib)
│   └── mockup-sandbox/      # UI component sandbox
├── lib/
│   ├── db/                  # @workspace/db — Drizzle schema, migrations, connection
│   ├── api-spec/            # OpenAPI spec + Orval config
│   ├── api-client-react/   # Generated React Query client
│   └── api-zod/            # Generated Zod schemas
├── scripts/                 # Dev scripts (dev.mjs launcher)
├── .env.example             # Template for environment variables
└── pnpm-workspace.yaml      # Monorepo config with minimumReleaseAge: 1440
```

## What I Learned

Building CARVIS taught me three things I didn't know before:

1. **Content Security Policy forces architectural decisions.** I initially tried injecting React directly into Canvas pages — CSP blocked it immediately. The `postMessage` + iframe overlay approach feels more complex, but it's actually the same technique LTI tools use, and it gives you real isolation for free.

2. **Scoped IDs prevent subtle bugs at scale.** Two Canvas instances can have a course with ID `12345` — without the `userId__c` prefix, they silently overwrite each other in Postgres. I caught this early when testing with a second user, and the scoped ID pattern now guarantees no cross-instance collisions anywhere in the schema.

3. **Free-tier LLMs make bad routers.** Using Groq's `llama-3.1-8b-instant` for intent classification was simple, but it randomly misclassified "what's due tomorrow" as "tutor". The fix was rules-first, LLM-second — deterministic regex for the top-20 common queries, LLM only for genuinely ambiguous input. This dropped misclassification from ~15% to near-zero for the queries people actually make.

## Security

- Canvas tokens encrypted at rest with AES-256-GCM + random IV
- Scoped user IDs prevent cross-instance data collisions
- `sameSite: "lax"` cookies + Origin allowlist on API for CSRF protection
- Extension agent blocks destructive actions (submit, delete, withdraw) by default
- Canvas URL validation on both frontend (pattern matching) and backend (regex + reachability probe)
- `pnpm` supply-chain defense: `minimumReleaseAge: 1440` prevents install of packages published within the last 24 hours

## Tech Stack

- **Frontend:** React 19, Vite 7, wouter (routing), Tailwind CSS, Three.js (orb visualization), Web Speech API
- **Backend:** Express 5, Drizzle ORM, Postgres, Groq (LLM), bcryptjs
- **Extension:** Manifest V3, content scripts, postMessage bridge
- **Build:** pnpm workspaces, TypeScript, Vitest

## License

MIT
