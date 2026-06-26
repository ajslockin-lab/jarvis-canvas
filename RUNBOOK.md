# Runbook

Operator playbook for the Carvis production environment. If you're new
and the API is on fire: scroll to **Common incidents** first.

## Topology

```
              ┌─────────────────────────┐
              │   Render (web service)  │
              │   artifacts/api-server  │
              │   Express 5 + Drizzle   │
              └──────┬──────┬───────────┘
                     │      │
              ┌──────▼──────▼────────┐
              │  Managed Postgres    │
              │  carvis_app role     │
              └──────────────────────┘
```

The frontend (`@workspace/jarvis-canvas`) is a separate static-site
service — typically Vercel or a Render Static Site, pointed at the API
URL via `VITE_API_URL`.

## Common incidents

### API is down — won't accept connections

1. **Check Render dashboard** for the `carvis-api` service status. If
   it's restarting in a crash loop, look at the last lines of the log.
2. **Common cause: missing env var.** The API refuses to boot if `PORT`,
   `ENCRYPTION_KEY`, or `RESEND_API_KEY` (prod only) is unset. Render
   shows the boot stderr.
3. **Common cause: Postgres unreachable.** Check that the linked
   `DATABASE_URL` is still valid (Render sometimes rotates credentials).
4. **Rollback a bad deploy:** `Manual Deploy → Deploy a previous
   commit` in Render. Revert the commit in git after.

### Auth errors after deploy — "Session expired or invalid"

You almost certainly rolled out a different `ENCRYPTION_KEY` env var.
Tokens in the DB are AES-GCM encrypted under the previous key and
cannot be decrypted with the new one. Every user has to re-authenticate.

**Do this only if you meant it.** To force the rotation, update the
env var → redeploy → users see 401s → they reauth → log in fine
again. There's no built-in dual-key mode today.

To rotate *without* breaking everyone, run a migration that re-encrypts
all `users.canvasAccessTokenEncrypted` and `users.canvasRefreshTokenEncrypted`
rows under the new key first. Documented in TODO.md (not yet written).

### Users get "Origin not allowed"

`ALLOWED_ORIGINS` is missing, doesn't include the frontend URL, or has
a stray space. Restart isn't enough — fix the env var in Render and
trigger a redeploy. (Code change is NOT required.)

### Scheduled reminder / sync jobs are flooding logs

`sync-scheduler` (5 min cooldown) and `reminder-scheduler` (60 s) are
toggled via `CANVAS_SYNC_ENABLED` and `REMINDER_SCHEDULER_ENABLED`
respectively. Set both to `false` and redeploy to pause them.

### Postgres connection exhaustion

`statement_timeout: 10s` should keep runaway queries from piling up,
and the `pg.Pool` defaults are conservative. If you see errors like
`remaining connection slots are reserved`, inspect the running query list:

```sql
SELECT pid, state, query_start, left(query, 80)
FROM pg_stat_activity
WHERE application_name = 'carvis_api'
  AND state != 'idle'
ORDER BY query_start;
```

Long-running queries in "idle in transaction" state are almost always
a forgotten `BEGIN` in a code path; they'll be terminated at 30 s by
`idle_in_transaction_session_timeout`.

### Resend (email) errors

Password reset / verification emails go through Resend. If Resend is
unreachable, the auth route 5xxs. The user can request a new code; we
don't queue locally. (Local cache would risk sending duplicates.)

## Health checks

| URL        | Purpose                                                |
|------------|--------------------------------------------------------|
| `/healthz` | Liveness. Cheap, always 200 unless the loop is wedged. Use for k8s liveness probe / Render health check. |
| `/readyz`  | Readiness. Pings Postgres with a 5 s timeout. 503 if DB is unreachable. Use for k8s readiness probe — keep traffic off nodes that 503 here. |
| `/api/errors` (POST) | Client-side crash reporter; pino log entries tagged `source: "client"`. |

## Routine maintenance

### Schema migrations

Drift-free in practice with `drizzle-kit push` for the dev environment.
For prod, prefer to generate a migration:

```bash
pnpm --filter @workspace/db exec drizzle-kit generate
```

Review the generated SQL, add to `lib/db/drizzle/NNNN_*.sql`, and
let Render's deploy run it via the build command. The existing
`scripts/apply-security-hardening.mjs` is the precedent for shipping raw
SQL alongside Drizzle migrations.

### Audit log

```sql
SELECT occurred_at, actor_user_id, operation, table_name, row_id
FROM audit_log
ORDER BY occurred_at DESC
LIMIT 100;
```

`audit_log` is `INSERT`-only and excluded from `carvis_app` privileges
for UPDATE/DELETE. To dump for an investigation you'd need to provision
a superuser connection — that's the correct posture for a tamper-evident
log.

### Secrets rotation

| Secret               | How to rotate                       | Downtime                          |
|----------------------|-------------------------------------|-----------------------------------|
| `ENCRYPTION_KEY`     | Re-encrypt all Canvas tokens under  | All users reauth once             |
| `RESEND_API_KEY`     | Generate new key in Resend, swap in | Brief: 1-2 email batches delay    |
| `DATABASE_URL`       | Provision new DB, swap, fail over   | Need a maintenance window         |
| `GROQ_API_KEY`       | Provision in Groq, swap             | None (NLU falls back to rules)    |
| `VAPID_*`            | Regenerate with `npx web-push generate-vapid-keys` | Users re-subscribe to push |

### Backups

The audit log is in the same DB. Back up the DB with whatever
point-in-time recovery your Postgres provider offers; on Render, the
managed DB ships daily backups retained for 7 days on the `starter`
plan, longer on higher plans.

`lib/db/scripts/verify-security-hardening.mjs` will tell you if a
restored DB lost its hardening (extensions, `carvis_app` role, audit
triggers) — re-run if it fails.

## Logs

- **Render** — pino JSON to stdout. Search with `Render → Logs → search`.
- **Client errors** — also go into the same stream as `source: "client"`
  pino records. Filter by client message.
- The dev script uses `pino-pretty` (colorized); production uses
  raw JSON. Don't ship `pino-pretty` to prod — the `esbuild-plugin-pino`
  tree-shakes it out already.

## Capacity

The API is HTTPs behind a single Render web service. Vertical scaling is
the primary lever. Horizontal scaling is unneeded today — RabbitMQ-style
job queues are not introduced; scheduled jobs are in-process and a single
replica is correct for them.

If you scale to multiple replicas:

- `sync-scheduler` and `reminder-scheduler` will run on every replica.
  Pick a leader (e.g. only run when `process.env["INSTANCE_INDEX"] ===
  "0"`) before adding more replicas, or extract the schedulers to a
  separate service.

## Failure modes we DO NOT handle

- **No DR site.** A region-wide Render outage takes us offline. Mitigation
  eventually: an active-active Postgres replica in another region.
- **No CDN in front of the API.** Heavy traffic from one university
  (e.g. finals week) will hit origin. Mitigation: a CDN with
  `Cache-Control` overrides per-route or, better, exclusive cache for
  the public manifest/webmanifest path only.
