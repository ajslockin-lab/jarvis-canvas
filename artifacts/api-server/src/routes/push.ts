// Push subscription endpoints.
//
// POST   /api/push/subscribe        — store a new PushSubscription for the user
// DELETE /api/push/subscribe        — remove by endpoint
// GET    /api/push/vapid-public-key — return the VAPID public key so the
//                                     client can subscribe. Returns null when
//                                     VAPID isn't configured (so the client
//                                     can hide the opt-in UI cleanly).
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { getVapidPublicKey } from "../lib/webpush.js";

const router = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(64),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post("/push/subscribe", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  const { endpoint, keys } = parsed.data;

  // Upsert: same browser re-subscribing should update the keys in place
  // rather than creating a duplicate row. The endpoint is globally unique
  // so the conflict is on the existing row.
  const [existing] = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint))
    .limit(1);

  if (existing) {
    await db
      .update(pushSubscriptionsTable)
      .set({ userId: user.id, p256dh: keys.p256dh, auth: keys.auth })
      .where(eq(pushSubscriptionsTable.id, existing.id));
  } else {
    await db.insert(pushSubscriptionsTable).values({
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  }

  res.status(201).json({ ok: true });
});

router.delete("/push/subscribe", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  const { endpoint } = parsed.data;
  await db
    .delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, user.id)));

  res.json({ ok: true });
});

export default router;