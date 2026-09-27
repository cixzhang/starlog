/* Starlog service worker: offline-first app shell.
 *
 * - Install: cache the shell (/, index.html) plus same-origin static assets
 *   as they are fetched (runtime cache-first).
 * - Fetch: same-origin GET -> cache-first, falling back to network and then
 *   to cached index.html for navigations. Cross-origin (the Supabase API)
 *   always goes to the network and is never cached.
 * - Keep it simple: no background sync, no push.
 */

const SHELL = 'starlog-shell-v1';
const ASSETS = 'starlog-assets-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/index.html']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL && k !== ASSETS)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache the journal API.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(ASSETS).then((cache) => cache.put(request, copy));
        }
        return res;
      }).catch(() => {
        // Offline navigation: fall back to the shell.
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        throw new Error('offline');
      });
    }),
  );
});
