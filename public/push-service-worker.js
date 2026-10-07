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
