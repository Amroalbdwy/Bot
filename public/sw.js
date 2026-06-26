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
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('https://www.cloudflare.com'));
});
