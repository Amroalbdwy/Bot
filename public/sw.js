self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', e => {
  let data = { title: '🔔 رسالة جديدة', body: '' };
  try { data = e.data.json(); } catch(err) { try { data.body = e.data.text(); } catch(err2){} }
  e.waitUntil(
    self.registration.showNotification(data.title || '🔔 رسالة جديدة', {
      body: data.body || '',
      icon: 'https://www.cloudflare.com/favicon.ico',
      badge: 'https://www.cloudflare.com/favicon.ico',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: { url: data.url || null }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || 'https://www.cloudflare.com';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      for (var i = 0; i < cs.length; i++) {
        if (cs[i].url === url && 'focus' in cs[i]) return cs[i].focus();
      }
      return clients.openWindow(url);
    })
  );
});
