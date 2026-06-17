# JARVIS Canvas Assistant

An AI voice assistant for Canvas LMS that syncs your courses, tracks deadlines, reads grades, and lets you ask questions by voice — with a sci-fi HUD interface.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `ENCRYPTION_KEY` — 32-byte hex string for AES-256-GCM token encryption
- Optional env: `GROQ_API_KEY` — for AI voice command responses

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS v4 + wouter (routing)
- API: Express 5 + cookie-parser + zod validation
- DB: PostgreSQL + Drizzle ORM
- AI: Groq SDK (llama-3.1-8b-instant) for voice NLU + response
- Auth: Canvas Personal Access Token (PAT), AES-256-GCM encrypted at rest
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/jarvis-canvas/src/` — React frontend
  - `pages/` — LandingPage, SignInPage, DashboardPage, SettingsPage, ExtensionIframePage
  - `components/dashboard/` — AssignmentCard, FunctionalCalendar, GradesPanel, ProactiveFeed
  - `components/voice/` — VoiceInterface, Waveform
  - `components/auth/` — CanvasConnectButton
  - `components/extension/` — ExtensionOverlay (Chrome extension iframe)
  - `index.css` — HUD sci-fi theme (source of truth for design tokens)
- `artifacts/api-server/src/` — Express API
  - `routes/auth.ts` — PAT sign-in + OAuth start
  - `routes/canvas.ts` — sync, grades, assignment toggle
  - `routes/user.ts` — user data endpoint
  - `routes/voice.ts` — GROQ-powered voice command
  - `routes/extension.ts` — page-aware Canvas extension agent
  - `lib/crypto.ts`, `lib/auth.ts`, `lib/canvas-fetch.ts`, `lib/nlu.ts`
- `lib/db/src/schema/jarvis.ts` — Drizzle schema (users, courses, assignments, grades, reminders, conversations)

## Architecture decisions

- **PAT auth over OAuth**: Canvas PAT (Personal Access Token) is used instead of OAuth because it requires no Canvas admin approval and works with any student account. Token is encrypted with AES-256-GCM before storing in DB.
- **Cookie + header auth**: `requireAuth` accepts both `canvas_user_email` cookie and `X-Auth-Email` header — the header is needed for the Chrome extension iframe where SameSite=Lax blocks cookies cross-site.
- **Groq for voice NLU**: llama-3.1-8b-instant via Groq gives sub-500ms responses suitable for voice. All calls gracefully fall back to rule-based responses when GROQ_API_KEY is absent.
- **No OpenAPI codegen**: Routes are typed manually via Zod; the OpenAPI/Orval codegen pipeline was not used since all API consumers are in the same repo.

## Product

- Landing page with hero, feature grid, how-it-works, and sign-up CTA
- PAT-based Canvas sign-in — paste your Canvas URL and access token
- Dashboard with live clock, upcoming assignments, interactive week calendar, grades readout, and JARVIS Intel feed
- Voice interface — hold mic button, speak, get AI response (+ text-to-speech playback)
- Settings — sync now, toggle TTS, set energy level
- Chrome extension iframe overlay — draggable panel showing calendar, deadlines, grades, and voice control on any Canvas page

## Gotchas

- `ENCRYPTION_KEY` must be a 64-char hex string (32 bytes). Generate with: `openssl rand -hex 32`
- API server uses `zod` (not `zod/v4`) — esbuild cannot resolve the `/v4` subpath export
- Canvas token sync requires `canvasUserId` to be populated (set during PAT sign-in via `/api/v1/users/self`)
- Grades only sync if Canvas enrollments API includes grades (requires `StudentEnrollment` type)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
