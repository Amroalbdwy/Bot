self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(ex) { data = { title: '🔔 رسالة جديدة', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || '🔔 إشعار', {
    body: data.body || '',
    icon: 'https://www.cloudflare.com/favicon.ico',
    badge: 'https://www.cloudflare.com/favicon.ico',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: { url: data.url || 'https://www.cloudflare.com' }
  }));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || 'https://www.cloudflare.com'));
});
