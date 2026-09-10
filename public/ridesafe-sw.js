self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {}; try { data = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(data.title || 'RideSafe', {
    body: data.body || '', icon: '/ridesafe-mark.svg', badge: '/ridesafe-mark.svg',
    tag: data.tag, data: { url: '/parent' }, requireInteraction: data.type === 'BUS_ETA_5_MIN',
    vibrate: data.type === 'BUS_ETA_5_MIN' ? [300, 150, 300, 150, 300] : [200]
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => new URL(client.url).pathname === '/parent');
    return existing ? existing.focus() : self.clients.openWindow('/parent');
  }));
});
