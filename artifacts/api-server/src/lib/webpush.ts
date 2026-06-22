// Web-push helper.
//
// Sends a notification to one or more of the current user's subscriptions.
// Subscriptions are looked up by userId, sent in parallel, and any 410 (Gone)
// responses are deleted from the DB — that's the push service telling us
// the subscription is dead and the browser no longer has it.
//
// VAPID keys are read from env at request time (not module load), so the
// same binary boots fine in dev (where we log only) and prod (where we
// actually send). The public key is also exposed via GET /api/push/vapid-public-key
// so the client can subscribe without shipping the key in the bundle.
import webpush from "web-push";
import type { PushSubscription as WebPushSubscription } from "web-push";

import { db } from "@workspace/db";
import { pushSubscriptionsTable, type PushSubscription } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

let vapidConfigured = false;

function configure(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:hello@carvis.app";
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.error("[webpush] setVapidDetails failed:", err);
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function dbToWebPush(sub: PushSubscription): WebPushSubscription {
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configure()) {
    // Dev fallback: log only. The WIP setup means VAPID isn't set in local
    // dev unless the operator generates keys — that's intentional, no one
    // wants test notifications on their phone every time they click a button.
    console.log(`[webpush:dev] would notify ${userId}: ${payload.title} — ${payload.body}`);
    return;
  }

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(dbToWebPush(sub), body);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404 and 410 both mean the subscription is dead — delete it so we
        // don't keep retrying a subscription the browser already threw away.
        if (status === 404 || status === 410) {
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
          return;
        }
        // Other errors (rate limit, network) — log and move on. The reminder
        // row stays active; the next tick will retry.
        console.error(`[webpush] send failed for ${sub.endpoint}:`, (err as Error).message);
      }
    }),
  );
}

export function getVapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"] ?? null;
}