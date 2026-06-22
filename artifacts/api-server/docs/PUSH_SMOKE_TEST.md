# Push notification smoke test

This is a manual end-to-end test of the web-push flow. Run it once after
deploying to confirm everything is wired correctly. The unit tests in
`src/__tests__/push.test.ts` cover the schema + helper, but the browser-side
delivery (service worker, permission prompt, OS notification) can only be
verified by hand.

## Pre-requisites

- [ ] `pnpm --filter @workspace/db run push` completed (push_subscriptions table exists)
- [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` set in `C:\Users\sarth\jarvis-canvas\.env`
- [ ] `VITE_VAPID_PUBLIC_KEY` set in `C:\Users\sarth\jarvis-canvas\artifacts\jarvis-canvas\.env`
- [ ] api-server running with the new env (restart after editing .env)
- [ ] Web app running (`pnpm dev`)
- [ ] Browser: Chrome desktop or Android Chrome (push not supported in Safari < 16.4)

## Step 1 — VAPID key reaches the client

Open the dev tools Network tab, then navigate to the dashboard.

Look for: `GET /api/push/vapid-public-key`

Expected: status 200, body `{ "publicKey": "BI6e9m_Fj..." }` (same value as
your `VAPID_PUBLIC_KEY` env var).

If you see `{"publicKey": null}` instead, the api-server didn't pick up the
env var — restart it.

## Step 2 — Settings UI shows the toggle

Go to Settings → scroll to "VOICE & AUDIO" → "PUSH NOTIFICATIONS".

Expected: a toggle row, bell icon, description "Reminders and deadlines will
arrive as system notifications". Status should NOT be greyed out / spinner.

If you see "Checking browser support…" stuck for > 1 second, the fetch in
Step 1 failed. Check the console.

If you see "Not available on this device or server not configured", the
public key came back null. Restart the api-server.

## Step 3 — Opt in

Click the toggle. The browser should pop a native permission prompt:
"carvis.app wants to show notifications".

- Click "Allow"
- Toggle should slide to the right (red)
- Description should stay the same

After clicking Allow, the api-server should receive a `POST /api/push/subscribe`.
Check the api-server logs for the request. Also verify in the DB:

```sql
SELECT user_id, endpoint, created_at FROM push_subscriptions;
```

Expected: one row with your user's id and a `fcm.googleapis.com` or
`updates.push.services.mozilla.com` endpoint.

## Step 4 — Trigger a reminder (push delivery test)

You need a reminder with `triggeredAt` within 60 seconds of now. Easiest way
is to create a test reminder directly via the api:

```bash
# In a new terminal
curl -X POST http://localhost:8080/api/reminders \
  -H "Content-Type: application/json" \
  -H "Cookie: canvas_user_email=you@school.edu" \
  -d '{
    "type": "custom",
    "triggeredAt": "<ISO date 30s from now>",
    "title": "Test push",
    "body": "If you see this on your phone, push works."
  }'
```

(use `new Date(Date.now() + 30_000).toISOString()` in node to get the timestamp)

Within ~30 seconds, you should see a native OS notification on your browser
/ device: "Test push" / "If you see this on your phone, push works." with a
small carvis icon.

## Step 5 — Click the notification

Click the notification when it appears.

Expected: a new browser tab opens to your app (or focuses the existing tab).
The URL in the reminder payload (`url` field) is the target — if you didn't
set one, it falls back to `/`.

## Step 6 — Opt out

Go back to Settings → click the toggle again.

Expected: toggle slides left (grey), bell icon changes, description stays.
Check the DB:

```sql
SELECT count(*) FROM push_subscriptions WHERE user_id = 'your-id';
```

Expected: zero rows for your user.

## Step 7 — Stale-subscription cleanup (optional, hard to trigger)

This is hard to test without waiting weeks for a real push service to send a
410. Skip unless you want to verify the path:

1. Manually insert a fake subscription row with a bogus endpoint.
2. Trigger a reminder for that user.
3. The `sendPushToUser` helper will fail with 404/410 and delete the row.

## Common failures

| Symptom | Likely cause |
|---|---|
| Toggle stuck on "Checking browser support…" | `/api/push/vapid-public-key` returns 404 or 500 |
| "Not available on this device…" | VAPID_PUBLIC_KEY is null in api-server env (restart) |
| Permission prompt never appears | Browser blocks third-party notifications on this origin (check site settings) |
| Permission granted, but no notification on Step 4 | `web-push` library threw on send — check api-server logs for `[webpush] send failed` |
| Notification arrives but click does nothing | Service worker not active — hard reload the page once after first install |

## When this is done

If all 7 steps pass, web-push is fully wired and ready for production. The
reminder scheduler (TBD) will use the same `sendPushToUser` helper to deliver
deadline alerts.
