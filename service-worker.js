const CACHE_NAME = 'sterlinx-v1';
// self.location.pathname is e.g. '/service-worker.js' or '/sterlinx-partners/service-worker.js'
const BASE = self.location.pathname.replace(/\/service-worker\.js$/, '') || '';
const SHELL = [BASE + '/', BASE + '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only cache same-origin GET requests; let everything else pass through
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'Sterlinx Partner Portal';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: BASE + '/icons/icon-192.png',
    badge: BASE + '/icons/icon-192.png',
    data: { url: data.url || '/' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const match = wins.find(w => w.url.includes(url) && 'focus' in w);
      if (match) return match.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
