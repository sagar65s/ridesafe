self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "RideSafe", {
      body: data.body || "",
      icon: "/ridesafe-mark.svg",
      badge: "/ridesafe-mark.svg",
      tag: data.tag,
      data: { url: data.url || "/parent" },
      requireInteraction:
        data.requireInteraction === true || data.type === "BUS_ETA_5_MIN",
      renotify: data.type === "BUS_ETA_5_MIN",
      silent: false,
      vibrate: Array.isArray(data.vibrationPattern)
        ? data.vibrationPattern
        : data.type === "BUS_ETA_5_MIN"
          ? [350, 180, 350, 180, 350]
          : [200],
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const target = event.notification.data?.url || "/parent";
        const existing = clients.find(
          (client) => new URL(client.url).pathname === target,
        );
        return existing ? existing.focus() : self.clients.openWindow(target);
      }),
  );
});
