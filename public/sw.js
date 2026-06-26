const BASE = "https://bot-psue.onrender.com";

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SET_UID') {
    self._uid = e.data.uid;
    self._pid = e.data.pid || e.data.uid;
    startPolling();
  }
});

function startPolling() {
  if (self._pollTimer) return;
  self._pollTimer = setInterval(async () => {
    const key = self._pid || self._uid;
    if (!key) return;
    try {
      const r = await fetch(BASE + '/push-poll?pid=' + encodeURIComponent(key) + '&uid=' + encodeURIComponent(self._uid || ''));
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
