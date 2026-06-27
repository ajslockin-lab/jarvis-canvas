// usePush — manages web-push subscription state for the current user.
//
// The hook deliberately does NOT store the subscription in state — it's
// owned by the service worker. State here is just the permission level
// and whether the user is currently opted-in (derived from a boolean
// flag passed in from the parent, or fetched from /api/push/status if
// we ever need it — for now we just trust the local permission state).

import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/api-base";

export type PushSupport = "loading" | "unsupported" | "ready";
export type PushPermission = "default" | "granted" | "denied" | "unsupported";

interface UsePushResult {
  support: PushSupport;
  permission: PushPermission;
  vapidPublicKey: string | null;
  optIn: () => Promise<boolean>;
  optOut: () => Promise<boolean>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Convert VAPID public key (base64url) into the Uint8Array the browser
  // expects for applicationServerKey. base64url strips '=' padding and
  // uses '-' / '_' instead of '+' / '/'.
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function usePush(): UsePushResult {
  const [support, setSupport] = useState<PushSupport>("loading");
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<PushPermission>("default");

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      // Feature detect: service worker + push manager + secure context.
      // Push only works in HTTPS (or localhost) — show "unsupported"
      // gracefully so the Settings UI doesn't error.
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !window.isSecureContext
      ) {
        if (!cancelled) {
          setSupport("unsupported");
          setPermission("unsupported");
        }
        return;
      }

      try {
        const res = await fetch(apiUrl("/api/push/vapid-public-key"), { credentials: "include" });
        if (!res.ok) throw new Error("vapid key fetch failed");
        const data = (await res.json()) as { publicKey: string | null };
        if (cancelled) return;
        if (!data.publicKey) {
          setSupport("unsupported");
          setPermission("unsupported");
        } else {
          setVapidPublicKey(data.publicKey);
          setSupport("ready");
          setPermission(Notification.permission as PushPermission);
        }
      } catch (err) {
        console.warn("[usePush] failed to fetch VAPID key:", err);
        if (!cancelled) {
          setSupport("unsupported");
          setPermission("unsupported");
        }
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const optIn = useCallback(async (): Promise<boolean> => {
    if (support !== "ready" || !vapidPublicKey) return false;

    // Request permission first. If the user denies, the rest of the flow
    // doesn't matter — we never get a subscription.
    const perm = await Notification.requestPermission();
    setPermission(perm as PushPermission);
    if (perm !== "granted") return false;

    // Wait for the SW to be active. Vite-plugin-pwa registers it on
    // page load, but the registration may not be ready by the time the
    // user clicks the opt-in button.
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      // Cast: TS 5.9's lib.dom.d.ts has narrowed Uint8Array to
      // Uint8Array<ArrayBuffer>, but URL-safe base64 decoding returns
      // Uint8Array<ArrayBufferLike>. The runtime value is a plain
      // ArrayBuffer-backed view — the typing is over-restrictive for
      // this specific DOM API. `applicationServerKey` accepts the broader
      // form at runtime; the cast is a no-op at the binary level.
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    const res = await fetch(apiUrl("/api/push/subscribe"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }),
    });
    return res.ok;
  }, [support, vapidPublicKey]);

  const optOut = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      setPermission(Notification.permission as PushPermission);
      return true;
    }

    const endpoint = subscription.endpoint;
    const unsubscribed = await subscription.unsubscribe();
    if (!unsubscribed) return false;

    await fetch(apiUrl("/api/push/subscribe"), {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    setPermission(Notification.permission as PushPermission);
    return true;
  }, []);

  return { support, permission, vapidPublicKey, optIn, optOut };
}