// Fluidez service worker.
//
// The whole point is that the app opens cold with no signal, because that is
// how it gets used. The shell is precached; the course itself lives in local
// storage, downloaded once at setup.
//
// VERSION is stamped by CI from a single source of truth. Nothing here is ever
// edited by hand — bumping a cache used to mean editing three files in lockstep
// and that is exactly how stale-asset bugs happened before.

const VERSION = '__VERSION__';
const SHELL = `fluidez-shell-${VERSION}`;
const RUNTIME = `fluidez-runtime-${VERSION}`;

// Everything needed to render the app with no network whatsoever.
const SHELL_FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/auth.js',
  './js/cloud.js',
  './js/config.js',
  './js/content.js',
  './js/engine.js',
  './js/mascot.js',
  './js/creatures.js',
  './js/screens.js',
  './js/setup.js',
  './js/speech.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// The Firebase SDK is pinned, so it can be cached like any other asset. Without
// this the app stalls on a dead network trying to reach gstatic.
const VENDOR = [
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Individually, so one 404 cannot fail the whole install.
    await Promise.all(SHELL_FILES.map((f) => cache.add(f).catch(() => {})));
    await Promise.all(VENDOR.map((u) =>
      fetch(u, { mode: 'cors' }).then((r) => (r.ok ? cache.put(u, r) : null)).catch(() => {})));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('fluidez-') && k !== SHELL && k !== RUNTIME)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Anything that talks to a live backend must never be served from a cache.
function isLiveApi(url) {
  return (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('firebaseio.com') ||
    url.hostname.endsWith('firebaseapp.com') ||
    url.pathname.endsWith('/version.json')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isLiveApi(url)) return;                    // straight to the network

  // Navigations: try the network so a deploy is picked up promptly, fall back
  // to the cached shell so opening with no signal still works.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) ||
          new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Course JSON from GitHub: cache it as it comes, serve it when offline.
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname === 'api.github.com') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) (await caches.open(RUNTIME)).put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // Everything else (our own assets, the pinned SDK): cache first, but ONLY on
  // an exact match.
  //
  // This used to match with `ignoreSearch: true`, which threw away the `?v=`
  // that CI stamps onto every asset — the entire point of which is to make a
  // new build a new URL. So `screen.js?v=2.8.32` matched a cached
  // `screen.js?v=2.8.30` and the app ran new markup against old code, or the
  // other way about, with no version anywhere disagreeing. A mismatch like that
  // does not look like a caching bug from the outside; it looks like a feature
  // that stopped working.
  //
  // Offline still works: a request that misses and cannot be fetched falls back
  // to whatever version of that file we do have, which is better than nothing.
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh.ok && url.origin === location.origin) {
        (await caches.open(RUNTIME)).put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const anyVersion = await caches.match(req, { ignoreSearch: true });
      return anyVersion || new Response('', { status: 504 });
    }
  })());
});

// ── the evening nudge ───────────────────────────────────────
// Only fires where the browser supports waking a worker on a schedule, which
// today means an installed Android PWA. iPhone would need a push server.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'fluidez-reminder') return;
  event.waitUntil((async () => {
    const hour = new Date().getHours();
    if (hour < 17 || hour > 22) return;
    const clientsList = await self.clients.matchAll({ type: 'window' });
    if (clientsList.length) return;              // they are already using it
    await self.registration.showNotification('Your streak is waiting', {
      body: 'A few minutes of Spanish keeps it alive.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'fluidez-daily',
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => c.url.includes(self.registration.scope));
    if (open) return open.focus();
    return self.clients.openWindow('./');
  })());
});
