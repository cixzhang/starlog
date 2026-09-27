/* Starlog service worker: offline-capable app shell that still updates.
 *
 * - App shell (/, /index.html, navigations): NETWORK-FIRST so a new deploy
 *   always reaches the installed PWA; falls back to the cached shell offline.
 *   (A previous cache-first shell pinned the PWA to a stale index.html that
 *   referenced bundles no longer deployed — the app wouldn't load.)
 * - Hashed static assets: cache-first (content-hashed, immutable).
 * - Cross-origin (the Supabase API) always goes to the network, never cached.
 * - Keep it simple: no background sync, no push.
 */

const SHELL = 'starlog-shell-v2';
const ASSETS = 'starlog-assets-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/index.html']))
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

  const isShell =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html';
  if (isShell) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches
              .open(SHELL)
              .then((cache) => cache.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: false }).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(ASSETS).then((cache) => cache.put(request, copy));
        }
        return res;
      });
    }),
  );
});
