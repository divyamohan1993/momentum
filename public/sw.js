/* Momentum service worker — Web Push + notification actions + minimal offline shell. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: "Momentum", body: event.data ? event.data.text() : "" };
  }
  const alarm = !!data.alarm;
  const options = {
    body: data.body || "",
    tag: data.tag || "momentum",
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    vibrate: alarm ? [300, 120, 300, 120, 300] : [140],
    icon: "/icons/192",
    badge: "/icons/192",
    data: { taskId: data.taskId, token: data.token, url: data.url || "/", kind: data.kind },
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
  event.waitUntil(self.registration.showNotification(data.title || "Momentum", options));
});

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  n.close();
  const d = n.data || {};
  const action = event.action;

  if ((action === "done" || action === "snooze" || action === "blocked") && d.taskId && d.token) {
    event.waitUntil(
      fetch("/api/reminders/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId: d.taskId, action, token: d.token }),
      }).catch(() => {}),
    );
    return;
  }

  const url = d.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          try {
            await c.navigate(url);
          } catch (_e) {}
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});

// Network-first navigation with a tiny offline fallback.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(
      () =>
        new Response(
          "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><style>body{background:#06070d;color:#eef1ff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0}</style><div>Momentum is offline. Reconnect to sync your board.</div>",
          { status: 503, headers: { "content-type": "text/html" } },
        ),
    ),
  );
});
