# Security

Carvis is a multi-surface assistant for Canvas LMS: web app, Chrome
extension, and an Express + Postgres API. It handles authentication tokens
(Personal Access Tokens and OAuth refresh tokens) that grant access to
your school Canvas account. We treat those tokens as carefully as
passwords.

## Reporting a vulnerability

**Please don't open a public GitHub issue for security problems.**

Email: **security@carvis.app**

We acknowledge reports within **2 business days** and aim to ship a fix
or a workaround within **14 days** for confirmed high-severity issues.
You'll get an update at least every 5 business days until the report is
closed. We follow coordinated disclosure: please give us a reasonable
window to patch before publishing details.

If you'd prefer encrypted communication, the email above supports PGP —
write first and we'll send a key.

## What to include in a report

- **Where** — URL, route, file path, or feature
- **What** — short description of the issue
- **Steps to reproduce** — minimal sequence (we'll take screenshots if
  you can share them)
- **Impact** — what an attacker could do, and which users are affected
- **Environment** — browser/OS for frontend issues, request IDs or
  timestamps for backend issues (look for `id` in pino logs)

Reports without steps to reproduce still get investigated — they often
hint at adjacent issues.

## In scope

- The Carvis API at `*.carvis.app/api/*`
- The Carvis web app at `*.carvis.app`
- The Chrome extension currently published as **CARVIS Canvas Assistant**
- Public package `@workspace/*` artifacts if their inclusion in the above
  surfaces makes them reachable

## Out of scope

- Your school Canvas instance itself — that's Instructure's responsibility,
  report issues to them
- Third-party LLM providers (Groq) — report to them
- Resend (email) — report to them
- Self-hosted instances other than `*.carvis.app` — patches welcome, but
  operability falls to whoever runs them

## Threat model — what we already defend against

| Threat                                              | Defense                                                                                  |
|-----------------------------------------------------|------------------------------------------------------------------------------------------|
| Stolen Canvas → GPA / grades                        | Token encrypted at rest (AES-256-GCM, random IV per record); user explicitly authenticates and can revoke from settings |
| Cross-instance data collisions (two Canvas schools) | Scoped IDs (`userId__c{canvasCourseId}`) on every Canvas-sourced row                    |
| CSRF via cookie auth                                | `SameSite=lax` + Origin allowlist on API                                                  |
| CSRF via session-token header                       | `requireAuth` validates Origin against the same allowlist                                |
| Reused package (supply chain)                       | `pnpm.minimumReleaseAge: 1440` (24 h) — fresh npm publishes can't install                |
| Runaway query                                       | `statement_timeout: 10s` on the `carvis_app` Postgres role                               |
| Forgotten BEGIN blocks                              | `idle_in_transaction_session_timeout: 30s`                                               |
| Forgotten dormant session                           | 30-day session TTL; login from a new device invalidates the cookie                       |
| Production push without staging                     | `NODE_ENV=production` requires `RESEND_API_KEY`; refuses to boot otherwise                |
| Risky page actions (extension)                      | Submit / delete / withdraw are explicitly blocked                                        |
| Unauthenticated server boot with placeholder secrets | `ENCRYPTION_KEY` is hard-required at startup                                             |
| Client-side exception invisible on the server       | `window.error` + unhandledrejection → `POST /api/errors`, logged server-side              |
| White-screen from a rendering crash                 | React `<ErrorBoundary>` at App root with fallback + retry                                |

## What we do not (yet) defend against

- **Compromise of a user's email** — password reset / email verification go
  to the inbox, so an attacker with mail access owns the account. (Standard
  for products without WebAuthn / passkeys.)
- **Compromise of the Carvis server itself** — `carvis_app` is not a Postgres
  superuser, but anyone with `ENCRYPTION_KEY` can decrypt every stored
  Canvas token. Treat the env var like a master password.
- **Canvas itself** — Canvas OAuth secrets for their third-party app
  flow live in our DB encrypted the same way as Canvas PATs.

## Bug bounty

We do not currently pay for reports. We do credit you in the changelog
and the README (under your preferred name) when a fix ships.

## Past advisories

None publicly — this is the first policy. Future advisories will be
listed in `CHANGELOG.md` under a `Security` heading.
