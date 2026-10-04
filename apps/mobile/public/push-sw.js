// Browser notifications for a guest's ride (Web Push). Copied as is to the root of the website by
// `expo export` (public/), and registered by the ride page with the site's base path as scope
// ("/" with Docker, "/driving/" on GitHub Pages). No fetch handler: pages and files are never cached here.
// Payload from the server: {"title","body","url":"/b/<token>","tag"}.

// The ride's address inside this worker's scope (so under the base path), never another site.
// Same logic as resolveInScope() in src/lib/webPush.ts.
function inScope(url) {
  const base = new URL(self.registration.scope);
  const target = new URL(String(url || '').replace(/^\/+/, ''), base);
  return target.origin === base.origin ? target.href : base.href;
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const options = {
    body: data.body || '',
    icon: inScope('push-icon.png'),
    badge: inScope('push-badge.png'),
    data: { url: inScope(data.url) },
  };
  if (data.tag) {
    // One notification per subject: a newer one replaces the older, and still alerts.
    options.tag = String(data.tag);
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title || '', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  const path = new URL(url).pathname;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (tabs) {
      // The ride page is already open: bring that tab forward.
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (new URL(tab.url).pathname === path && 'focus' in tab) return tab.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
