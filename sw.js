/* ============================================================================
   CutFree Studio — service worker
   The studio performs zero network requests, so caching the shell is enough to
   make the whole workbench work offline. Bump CACHE when files change.
   ========================================================================== */
const CACHE = 'cutfree-studio-v5';
const SHELL = [
  './', './index.html', './editor.html', './studio.html', './studio-pro.html',
  './css/style.css', './css/studio.css',
  './js/i18n.js', './js/app.js',
  './js/studio/themes.js', './js/studio/engine.js', './js/studio/music.js',
  './js/studio/muxer.js', './js/studio/encode.js', './js/studio/director.js',
  './js/studio/publish.js', './js/studio/captions.js', './js/studio/voice.js',
  './js/studio/align.js', './js/studio/story.js',
  './js/studio/ui.js',
  './assets/logo.svg', './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL).catch(() => undefined)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// cache-first (offline-first), with a network refresh in the background
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
