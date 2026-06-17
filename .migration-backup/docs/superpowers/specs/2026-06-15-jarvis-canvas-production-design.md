# JARVIS Canvas — Production-Ready Overhaul Design

**Date:** 2026-06-15
**Status:** Approved
**Approach:** Auth-First Vertical Slice (Approach A)

## Overview

Transform JARVIS Canvas from a single-user prototype into a production-ready product that any Canvas LMS student can use. Build in three phases, each shipping a complete, usable increment.

**Deployment target:** Vercel (app) + Supabase Postgres (database)
**Users:** Any student at any Canvas-powered school

---

## Phase 1: Foundation (Auth + Production Hardening)

### Canvas OAuth 2.0 Flow

1. **Onboarding wizard** — New user clicks "Connect Canvas" → enters their school's Canvas URL (e.g., `school.instructure.com`) → gets redirected to that school's Canvas OAuth authorize endpoint
2. **Canvas redirects back** with an authorization code → server exchanges it for an access token + refresh token → stored encrypted in Supabase
3. **NextAuth session** created from Canvas user identity (Canvas user ID as primary identifier, not email)
4. **Token refresh** — Server-side mechanism refreshes tokens using the refresh token before they expire

### Multi-Tenant School Support

- User enters their Canvas base URL during onboarding
- All Canvas API calls use that user's specific base URL + their encrypted token
- No hardcoded Canvas domain anywhere in the codebase

### Token Security

- Access tokens and refresh tokens encrypted at rest using AES-256 with `ENCRYPTION_KEY` server-side env var
- No plaintext tokens in the database
- Encryption key lives in Vercel environment variables only
- Prisma fields: `canvasAccessTokenEncrypted` and `canvasRefreshTokenEncrypted` (text columns storing ciphertext)

### Auth System Changes

- **Remove** the credentials provider entirely — Canvas OAuth IS the auth
- **Remove** fake `CanvasConnectButton` — replace with real OAuth redirect
- **Remove** all `findFirst()` with no auth check — every API route validates NextAuth session
- **Remove** hardcoded `gavirtual.instructure.com` — user-provided school URL stored on User model

### Database Schema Changes

**User model** additions:
- `canvasBaseUrl` — String (the user's Canvas instance URL, e.g., `https://school.instructure.com`)
- `canvasAccessTokenEncrypted` — String (AES-256 encrypted ciphertext)
- `canvasRefreshTokenEncrypted` — String (AES-256 encrypted ciphertext)
- `canvasTokenExpiresAt` — DateTime
- `canvasUserId` — String (Canvas API user ID, used as identity)
- Remove `canvasToken` (plaintext field)

### Security Fixes

- `git rm --cached` for `.env`, `.env.local`, `dev.log`, `tsconfig.tsbuildinfo`
- Properly enforce `.gitignore` rules for these files
- Remove `dev.log` from repository (611KB tracked file)
- Add rate limiting on API routes (per-user, per-IP) to prevent abuse
- CSRF protection via NextAuth (verify Canvas OAuth `state` parameter validation)
- Zod input validation schemas on all API routes (Canvas URL, reminder data, voice command body)
- VAPID keys for browser push stored in Vercel env vars, never in code

### Dependency Cleanup

**Remove unused packages:**
- `@supabase/supabase-js` — using Prisma to Supabase Postgres, not the Supabase client
- `@google/generative-ai` — never imported anywhere
- `inngest` — never imported anywhere
- `bcryptjs` — never imported anywhere

**Remove dead code:**
- `WeeklyCalendar.tsx` — alternate calendar never imported
- Wispr AI references in `lib/voice.ts` — unused integration stub

### Error Handling Architecture

**API layer:** Consistent error response shape across all routes:
```json
{ "error": "Human-readable message", "code": "MACHINE_READABLE_CODE" }
```
With proper HTTP status codes (401, 403, 404, 422, 500, 502).

**Canvas API calls:** Retry with exponential backoff (Canvas API can be flaky).
- 401 → token expired, attempt refresh then retry
- 403 → no permission, return user-facing message
- 404 → resource not found, graceful degradation
- 5xx → retry up to 3 times with backoff

**UI layer:** React error boundaries around major dashboard sections so one failing component doesn't tank the whole page. Toast notifications for user actions (sync succeeded, reminder created, assignment marked complete, etc.).

### Testing

- **Unit tests:** Vitest for `lib/` modules (Canvas API helpers, NLU pipeline, token encryption/decryption, alert generation)
- **Integration tests:** API route tests with mocked Prisma + mocked Canvas API
- **E2E tests:** Playwright for critical path (login → dashboard → sync data → toggle assignment)
- **Coverage focus:** auth flow, Canvas sync, reminder CRUD, token encryption — not every component

### CI/CD

- **GitHub Actions:** Run lint + type-check + tests on every push and PR
- **Vercel auto-deploy:** On push to `main` → auto-deploy to production
- **Preview deploys:** On push to any branch → Vercel preview URL for testing

### Code Quality

- Re-enable `@typescript-eslint/no-explicit-any` ESLint rule
- Add `no-unused-vars` ESLint rule
- Replace all `any` types with proper interfaces
- Use Prisma-generated types instead of duplicate manual interfaces in `types/index.ts`
- Each API route gets co-located Zod validation schema
- Remove `dev.log` tracking, add proper `.gitignore` entries

---

## Phase 2: Live Canvas Data

### Real Grades from Canvas

- Canvas API `GET /api/v1/courses/:id/enrollments?include[]=grades` returns real enrollment grades per course
- `GradesPanel.tsx` fetches real grade data via new API route `/api/canvas/grades` — no `demoGrades`
- Extension overlay pulls same real data — no more hardcoded percentages
- Letter grade calculation from `score` / `possible` ratio, matching existing logic

### Assignment Completion Toggling

- Canvas API `PUT /api/v1/courses/:course_id/assignments/:id` with submission data
- "Mark Complete" toggle on `AssignmentCard.tsx`:
  1. Updates Canvas via API (marks submission)
  2. Updates local Prisma DB (`assignment.completed = true`)
  3. Optimistic UI update with rollback on failure
- Completed assignments get visual "done" state: strikethrough, muted color, checkmark

### Expanded Course Data

- Sync route pulls: courses, assignments, enrollments with grades, course sections
- Store `currentScore` and `finalScore` per enrollment
- Course cards show real enrollment status and grade

### Data Freshness

- Canvas sync on login (automatic pull when user hits dashboard)
- Manual "SYNC" button still available (existing pattern)
- Cache Canvas data in Prisma — API calls only hit Canvas when syncing, not on every page load
- Show "Last synced: X minutes ago" timestamp on dashboard

### Database Schema Changes

**New `Grade` model:**
- `id` — String (cuid)
- `userId` — String
- `courseId` — String
- `currentScore` — Float (nullable)
- `finalScore` — Float (nullable)
- `letterGrade` — String (nullable)
- `fetchedAt` — DateTime

**Assignment model changes:**
- Already has `completed` field — wire it up to real Canvas API + UI toggle

**Course model changes:**
- Add `enrollmentId` — String (Canvas enrollment ID for grade lookups)

### What Gets Removed

- All `demoGrades` arrays from `GradesPanel.tsx` and `ExtensionOverlay.tsx`
- Hardcoded course arrays in the extension overlay
- The fake "CANVAS LINKED" state in settings
- Carvis typo — fix "ACTIVATE CARVIS" → "ACTIVATE JARVIS" in Dashboard.tsx

---

## Phase 3: Smart Features

### Dynamic Proactive Alerts

Replace the static hardcoded alerts with AI-driven alerts generated from real Canvas data:

- **Deadline urgency:** Assignments due <1hr, <24hr, overdue → auto-generated alerts
- **Free window detection:** Scan the week for gaps with no assignments due → "You have a 3-day window — get ahead on X"
- **Grade drop detection:** If a new grade is significantly lower than the course average → flag it
- **Workload spikes:** If 3+ assignments due the same day → "Heavy day ahead — consider starting early"

### Reminder Delivery

**In-app delivery:**
- Reminders surface in the ProactiveFeed when user visits the dashboard
- Pull-based: API route runs deadline/check logic on dashboard visit

**Browser push delivery:**
- Service Worker registered on login
- Uses Push API + VAPID keys (stored in Vercel env vars)
- User grants notification permission → reminders fire as browser notifications even with tab closed
- Push subscription endpoint stored on User model

**Quiet hours:**
- User setting: "Don't notify between Xpm–Yam" (stored in User preferences)
- Push notifications queued until quiet hours end

### Scheduling — Hybrid Pull + Vercel Cron

- **Dashboard visit (pull):** API route runs deadline checks + AI insights every time user visits dashboard. Zero cost, instant results.
- **Vercel Cron (once daily):** Single cron job checks for critical overdue items and triggers browser push notifications for those.
- **Service Worker:** Handles immediate push for user-set reminders.
- Avoids external scheduler dependency (Inngest removed). Good enough for v1.

### Improved NLU Pipeline

- Include grade context + reminder context in the NLU prompt
- Voice commands like "how am I doing in biology?" can reference real grades
- New intents: `check_grades` (real grade lookup), `mark_complete` (voice-driven assignment toggling)
- NLU response generator gets full user context: assignments, grades, reminders, alerts

### Database Schema Changes

**Reminder model additions:**
- `triggerAt` — DateTime (when the reminder fires)
- `deliveredAt` — DateTime (nullable, when it was actually delivered)
- `deliveryMethod` — String (push / in-app / both)

**User model additions:**
- `pushSubscription` — Json (browser push endpoint subscription object)
- `quietHoursStart` — String (e.g., "23:00")
- `quietHoursEnd` — String (e.g., "07:00")

**New `Alert` model:**
- `id` — String (cuid)
- `userId` — String
- `type` — String (deadline / grade_drop / workload / free_window)
- `title` — String
- `message` — String
- `dismissed` — Boolean (default false)
- `createdAt` — DateTime
- `expiresAt` — DateTime (nullable — alerts that are no longer relevant auto-expire)

---

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│                  CLIENT LAYER                    │
│  Dashboard │ Voice UI │ Chrome Extension │ PWA   │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│              NEXT.JS API LAYER                   │
│  Auth (NextAuth + Canvas OAuth)                  │
│  Canvas Sync │ Grades │ Reminders │ Alerts       │
│  Voice Command (NLU) │ Extension Agent           │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│           INTELLIGENCE LAYER                     │
│  Deadline Watcher │ AI Insight Engine            │
│  Reminder Scheduler │ Pattern Detector          │
│  (Runs in API routes + 1x daily Vercel Cron)    │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│              DATA LAYER                          │
│  Supabase Postgres (Prisma ORM)                 │
│  Users │ Courses │ Assignments │ Grades          │
│  Reminders │ Alerts │ Conversations              │
└─────────────────────────────────────────────────┘
```

### Delivery Channels

| Channel | Mechanism | When Active |
|---------|-----------|-------------|
| In-App Feed | Pull on dashboard visit | User on site |
| Browser Push | Service Worker + Push API | Tab open or closed |
| Voice Response | TTS when voice UI active | User activated JARVIS |

### User Controls (Settings)

- Toggle: push notifications on/off
- Toggle: in-app alerts on/off
- Toggle: voice summary on/off
- Quiet hours: start/end time
- Energy level: 1-5 (existing)

---

## Key Design Principles

1. **Sustainable code** — small focused modules, single responsibility, clear boundaries between Canvas logic / business logic / UI
2. **Graceful degradation** — if Canvas API is down, show cached data with "last synced" timestamp; if push fails, in-app still works
3. **No shortcuts to tech debt** — proper types everywhere, Zod validation, error handling at every layer, no `any`
4. **Ship complete increments** — each phase ends with something demoable and production-quality
5. **Real data, no fakes** — every hardcoded demo value replaced with live Canvas data; every fake button replaced with real functionality
