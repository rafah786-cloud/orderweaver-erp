const SHELL_CACHE = "mattress-maestro-public-shell-v1";
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/favicon-32x32.png",
  "/zizz-logo-180.png",
  "/zizz-logo-192.png",
  "/zizz-logo-512.png",
];
const SHELL_PATHS = new Set(PRECACHE_URLS);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("mattress-maestro-public-shell-") && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache an authenticated document or ERP/API response. A navigation
  // must validate against the live server; offline gets a safe static page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match("/offline.html");
        return offline || new Response("Connection required to access business records.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }),
    );
    return;
  }

  // Only cache fingerprinted build assets and an explicit allowlist of public
  // shell files. API calls, auth, company data, uploads and documents are excluded.
  const isBuildAsset = url.pathname.startsWith("/assets/");
  if (!isBuildAsset && !SHELL_PATHS.has(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

// Existing web-push behavior is kept on this same root-scoped registration.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text?.() ?? "" };
  }

  const title = data.title || "Mattress Maestro";
  const options = {
    body: data.body || "You have a new notification.",
    icon: data.icon || "/zizz-logo-180.png",
    badge: data.badge || "/zizz-logo-180.png",
    tag: data.tag || data.eventKey || undefined,
    renotify: true,
    data: {
      url: data.url || "/communications/inbox",
      eventKey: data.eventKey || null,
      refTable: data.refTable || null,
      refId: data.refId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/communications/inbox";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return clients.openWindow(target);
    }),
  );
});
