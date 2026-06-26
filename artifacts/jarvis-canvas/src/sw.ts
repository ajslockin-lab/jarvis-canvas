/// <reference lib="webworker" />
// CARVIS service worker.
//
// Responsibilities:
//   1. Activate immediately on install so push events reach us without
//      waiting for a controlled-client transition (Workbox's default
//      "waiting" state would silently drop the first push).
//   2. Handle `push` events by parsing the JSON payload and showing a
//      notification. The payload format is defined in lib/webpush.ts —
//      { title, body, url, tag }.
//   3. Handle `notificationclick` by opening (or focusing) the URL.
//
// We deliberately do NOT precache any HTML or assets — the user asked for
// no offline support. The SW exists only to receive push events.
//
// In dev, the SW is served by vite-plugin-pwa's devOptions (type: "module"),
// so this file is what runs in `pnpm dev` too.
//
// tsc note: this file uses `ServiceWorkerGlobalScope` types, but the main
// tsconfig includes `dom` lib (not `webworker`). The vite-plugin-pwa build
// uses esbuild which strips types — runtime is fine. We use targeted `as`
// casts to satisfy tsc without pulling in a second tsconfig just for this
// file.

// workbox-build, used by vite-plugin-pwa's injectManifest strategy, looks for
// this exact identifier on `self` and replaces the RHS with its precache
// manifest at build time. We don't precache anything (globPatterns: [], see
// vite.config.ts), so the array stays empty — the assignment is required
// only so the build doesn't bail with "unable to find a place to inject
// the manifest". Without this the production frontend build fails.
(self as unknown as { __WB_MANIFEST: unknown[] }).__WB_MANIFEST = [];

// `self` is typed as `Window & typeof globalThis` by the dom lib, but at
// runtime in a service worker it IS a ServiceWorkerGlobalScope. Cast
// through `unknown` to bridge the type gap without `// @ts-expect-error`.
// Alias it locally so the rest of the file reads naturally.
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("install", () => {
  // Skip waiting so the SW becomes active on the very first install. This
  // is what allows push to work right after the user opts in — otherwise
  // a push sent before the SW is fully active would be dropped.
  void sw.skipWaiting();
});

sw.addEventListener("activate", (event) => {
  // Claim any uncontrolled clients so the next push event has a target.
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener("push", (event) => {
  const pushEvent = event as PushEvent;
  if (!pushEvent.data) {
    // Push with no payload is invalid per the Web Push protocol. We can
    // still show a generic notification so the user isn't left wondering
    // why their phone buzzed.
    pushEvent.waitUntil(
      sw.registration.showNotification("Carvis", {
        body: "You have a new notification.",
        icon: "/pwa-192x192.png",
      }),
    );
    return;
  }

  let payload: { title?: string; body?: string; url?: string; tag?: string; icon?: string } = {};
  try {
    payload = pushEvent.data.json();
  } catch {
    // Non-JSON payload — treat as plain text.
    payload = { body: pushEvent.data.text() };
  }

  const title = payload.title || "Carvis";
  const options: NotificationOptions = {
    body: payload.body || "",
    icon: payload.icon || "/pwa-192x192.png",
    // `tag` replaces an existing notification with the same tag instead of
    // stacking. Reminders use the assignment id as the tag so a re-fire
    // for the same assignment doesn't pile up.
    tag: payload.tag,
    data: { url: payload.url },
  };

  pushEvent.waitUntil(sw.registration.showNotification(title, options));
});

sw.addEventListener("notificationclick", (event) => {
  const clickEvent = event as NotificationEvent;
  clickEvent.notification.close();

  const targetUrl = (clickEvent.notification.data as { url?: string } | undefined)?.url;
  if (!targetUrl) {
    // No URL — just focus the app.
    clickEvent.waitUntil(
      sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
        if (windowClients.length > 0) {
          const client = windowClients[0] as WindowClient;
          return client.focus();
        }
        return sw.clients.openWindow("/");
      }),
    );
    return;
  }

  clickEvent.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Try to focus a tab that's already on the target URL.
      for (const client of windowClients) {
        const wc = client as WindowClient;
        if (wc.url === targetUrl && "focus" in wc) {
          return wc.focus();
        }
      }
      // Otherwise open a new tab.
      return sw.clients.openWindow(targetUrl);
    }),
  );
});