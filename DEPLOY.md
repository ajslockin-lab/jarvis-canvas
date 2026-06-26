# Deployment

This document describes how Carvis ships to production.

## Targets

| Surface        | Target                  | How                                          |
|----------------|-------------------------|----------------------------------------------|
| API server     | Render web service      | `render.yaml` blueprint                      |
| Web app        | Vercel **or** Render Static Site | `vite build`, `VITE_API_URL` injected at build time |
| Postgres       | Render managed DB       | Linked via `fromDatabase:` in `render.yaml`  |
| Chrome ext     | Chrome Web Store        | ZIP from `artifacts/chrome-extension/`       |

A top-level `Dockerfile` is provided for self-hosted / Fly / Railway
deploys. It is **not** what Render uses — Render's blueprint is the
reference path.

## Quick path — Render Blueprint

1. Fork the repo.
2. In Render: **New → Blueprint**, point at the fork. The
   `render.yaml` creates `carvis-api` (web service) and `carvis-db`
   (managed Postgres).
3. Set the secrets Render can't infer:
   - `ENCRYPTION_KEY` — generate with `openssl rand -hex 32`
   - `RESEND_API_KEY` — `re_…` from resend.com
   - `ALLOWED_ORIGINS` — your web app URL after step 4
   - `GROQ_API_KEY` — optional; chat falls back to rules without it
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` —
     web push keys
4. Deploy the web app (Vercel or another Render Static Site). Set
   `VITE_API_URL` to the API URL from step 2.
5. Update the API's `ALLOWED_ORIGINS` to include the web URL.
6. (Optional) Configure a custom domain on Render + Vercel and add
   those to `ALLOWED_ORIGINS`.

## Required environment

| Var                    | Required in prod? | Notes                                       |
|------------------------|-------------------|---------------------------------------------|
| `NODE_ENV=production`  | ✅                | Triggers fail-closed email + stricter CORS  |
| `PORT`                 | ✅                | Render sets this automatically               |
| `DATABASE_URL`         | ✅                | Connected via Render DB link in `render.yaml` |
| `ENCRYPTION_KEY`       | ✅                | 64-char hex, `openssl rand -hex 32`         |
| `RESEND_API_KEY`       | ✅                | Refuses to boot in prod without it            |
| `EMAIL_FROM`           | ✅                | Sender on password-reset / verify emails     |
| `APP_URL`              | ✅                | Used in email links                         |
| `ALLOWED_ORIGINS`      | ✅                | Comma-separated, no trailing slash          |
| `GROQ_API_KEY`         | optional          | Free fallback to rules-based NLU works       |
| `VAPID_PUBLIC_KEY`     | optional          | Web push. Generate with `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY`    | optional          | Web push                                    |
| `VAPID_SUBJECT`        | optional          | `mailto:hello@yourdomain.com`               |
| `CANVAS_SYNC_ENABLED`  | default true      | Toggles the canvas sync scheduler            |
| `REMINDER_SCHEDULER_ENABLED` | default true | Toggles the reminder scheduler               |
| `CANVAS_CLIENT_ID` / `CANVAS_CLIENT_SECRET` | optional | OAuth (PAT auth still works)                 |

A complete template lives in `.env.example`.

## Local production checkpoint

Before pushing:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/jarvis-canvas run build
```

A green run on all four means the deploy is safe to ship.

## Deploying the web app to Vercel

1. **New Project → Import** your fork.
2. Root directory: `artifacts/jarvis-canvas`
3. Build command: `pnpm install --frozen-lockfile && pnpm run build`
4. Output directory: `dist/public`
5. Environment variables:
   - `VITE_API_URL` — the API URL, **no trailing slash**
   - `VITE_VAPID_PUBLIC_KEY` — VAPID public key from step 3 above
6. Deploy.

## Deploying via Docker (Fly, Railway, self-host)

```bash
docker build -t carvis-api .
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e DATABASE_URL=postgres://… \
  -e ENCRYPTION_KEY=… \
  -e RESEND_API_KEY=… \
  -e ALLOWED_ORIGINS=https://your-domain \
  -e APP_URL=https://your-domain \
  carvis-api
```

Mirror `docker-compose.yml` is out of scope; the Dockerfile is the
contract.

## Database migrations

Dev: `drizzle-kit push` (run by `scripts/dev.mjs` automatically).
Prod: prefer `drizzle-kit generate` plus the SQL shipping in
`lib/db/drizzle/`. The `apply-security-hardening.mjs` script ships
raw SQL alongside generated migrations — co-locate the new migration
with it.

## Smoke test after deploy

Once the API hostname is wired up:

```bash
curl -sf https://carvis-api.example.com/api/healthz && echo OK
curl -sf https://carvis-api.example.com/api/readyz  && echo OK
```

Both should return `{"status":"ok"}`. If `/healthz` is `ok` and
`/readyz` is 503, Postgres is the bottleneck, not the app.

## Troubleshooting

### "ENCRYPTION_KEY environment variable is not set" at boot

The API refuses to start when `ENCRYPTION_KEY` is missing. Generate with
`openssl rand -hex 32` and add it to Render's env (with `sync: false` so
it's not visible in PR-triggered deploys).

### All cross-origin requests rejected after deploy

`ALLOWED_ORIGINS` is unset. The app boots but CORS rejects everything;
browsers surface a fetch TypeError. Add the frontend URL (no trailing
slash) and redeploy — no code change needed.

### /healthz is OK but /readyz is 503

Database is unreachable from the API. Check `DATABASE_URL` and the
Render DB status. Verify with `psql "$DATABASE_URL" -c 'SELECT 1'` from
anywhere that has network access to the DB.

### Stuck reminder notifications

Set `REMINDER_SCHEDULER_ENABLED=false` and redeploy to halt the loop.
Inspect pino logs for `reminder-scheduler` and look for repeat
failures on a specific user/assignment.

## Rollback

**Render:** `Manual Deploy → Deploy a previous commit`. Free.

**Vercel:** `Deployments → Promote` any prior deployment to production.

Both revert with no DB migration revert. If a release included a DB
migration, write a follow-up migration to roll it back rather than
swapping code — the schema stays consistent.
