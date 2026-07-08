/* 온주 Web Push 핸들러 — workbox generateSW가 importScripts로 로드한다.
   서버(Edge Function send-reminders)가 보낸 푸시를 받아 알림을 표시한다. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '온주', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '온주';
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.svg',
    badge: '/pwa-192x192.svg',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of wins) {
        if ('focus' in c) {
          if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* noop */ } }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
