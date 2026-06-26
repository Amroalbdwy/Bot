const BASE = "https://bot-psue.onrender.com";

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SET_UID') {
    self._uid = e.data.uid;
    startPolling();
  }
  if (e.data && e.data.type === 'NOTIFY') {
    self.registration.showNotification(e.data.title || '🔔', {
      body: e.data.body || '',
      icon: 'https://www.cloudflare.com/favicon.ico',
      vibrate: [200, 100, 200],
      requireInteraction: true
    });
  }
});

function startPolling() {
  if (self._pollTimer) return;
  self._pollTimer = setInterval(async () => {
    if (!self._uid) return;
    try {
      const r = await fetch(BASE + '/push-poll?uid=' + encodeURIComponent(self._uid));
      const d = await r.json();
      if (d && d.msg) {
        self.registration.showNotification(d.title || '🔔 رسالة جديدة', {
          body: d.msg,
          icon: 'https://www.cloudflare.com/favicon.ico',
          vibrate: [200, 100, 200],
          requireInteraction: true
        });
      }
    } catch(e) {}
  }, 3 * 60 * 1000);
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('https://www.cloudflare.com'));
});
