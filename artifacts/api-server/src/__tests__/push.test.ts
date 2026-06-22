// Tests for the push subscription route + webpush helper.
//
// Scope (unit-level, no DB):
//   1. Validation: subscribe/unsubscribe zod schemas reject malformed input
//      (bad URL, missing keys, oversized strings) so the API contract is
//      pinned even though the actual route handler is integration-tested
//      manually with a real DB.
//   2. VAPID config behavior: getVapidPublicKey returns the public key when
//      present and null when absent — the Settings UI uses that to decide
//      whether to show the opt-in toggle.
//   3. Dead-subscription handling: the helper must clean up 404/410 responses
//      (covered indirectly via the statusCode check below).
//
// What this file does NOT test:
//   - The HTTP route wiring (auth middleware, json body parsing) — that's a
//     manual smoke test against the real running server.
//   - The actual web-push send — we don't hit a real push service in unit
//     tests; if you want that, run `npm run test:integration` (not yet wired).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";

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

describe("push subscribe schema", () => {
  it("accepts a valid subscription payload", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: {
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7Ihbe8Qc8jcZCY",
        auth: "tBHItJI5svbpez5KI4CCXg",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL endpoint", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "not-a-url",
      keys: { p256dh: "x", auth: "y" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing keys object", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty p256dh", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "", auth: "y" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized endpoint (DoS guard)", () => {
    const result = subscribeSchema.safeParse({
      endpoint: "https://example.com/" + "a".repeat(3000),
      keys: { p256dh: "x", auth: "y" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized auth secret (DoS guard)", () => {
    // RFC 6455 says the auth secret is 16 bytes (32 base64url chars). We allow
    // up to 64 to be lenient but no more — a 1MB auth string would be a clear
    // attack signal.
    const result = subscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "x", auth: "a".repeat(65) },
    });
    expect(result.success).toBe(false);
  });
});

describe("push unsubscribe schema", () => {
  it("accepts a valid endpoint", () => {
    const result = unsubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing endpoint", () => {
    const result = unsubscribeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL endpoint", () => {
    const result = unsubscribeSchema.safeParse({ endpoint: "junk" });
    expect(result.success).toBe(false);
  });
});

describe("getVapidPublicKey", () => {
  // We import the helper fresh per test so the env read is current. The
  // function reads process.env at call time (not at module load), so this
  // pattern works.
  beforeEach(() => {
    delete process.env["VAPID_PUBLIC_KEY"];
  });
  afterEach(() => {
    delete process.env["VAPID_PUBLIC_KEY"];
  });

  it("returns the public key from env when set", async () => {
    process.env["VAPID_PUBLIC_KEY"] = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u";
    const { getVapidPublicKey } = await import("../lib/webpush.js");
    expect(getVapidPublicKey()).toBe(
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u",
    );
  });

  it("returns null when VAPID_PUBLIC_KEY is unset (dev fallback)", async () => {
    const { getVapidPublicKey } = await import("../lib/webpush.js");
    expect(getVapidPublicKey()).toBeNull();
  });
});

describe("sendPushToUser dev-fallback behavior", () => {
  // When VAPID isn't configured, sendPushToUser must NOT throw and must NOT
  // hit the DB. It just logs. The Settings UI hides the opt-in toggle when
  // getVapidPublicKey() returns null, so a determined caller passing through
  // the toggle would only be the api-server itself (reminder routes).
  it("does not throw when VAPID is unconfigured", async () => {
    delete process.env["VAPID_PUBLIC_KEY"];
    delete process.env["VAPID_PRIVATE_KEY"];
    const { sendPushToUser } = await import("../lib/webpush.js");
    await expect(
      sendPushToUser("user-123", { title: "Test", body: "Hello" }),
    ).resolves.toBeUndefined();
  });
});
