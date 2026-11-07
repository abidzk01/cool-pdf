'use strict';

// RxPDF Cool service worker.
//
// The app is fully static and does all PDF work in the page, so caching the
// shell makes every tool work offline. Generated blocks are maintained by
// `node tools/stamp-assets.js`; do not edit them by hand.
//
// Strategy:
//   - navigation (index.html): network-first, fall back to the cached shell
//   - content-hashed assets (?v=): cache-first
//   - everything else same-origin: stale-while-revalidate
//
// No user file is ever cached: PDFs live in memory/blob URLs, and only the app
// shell, libraries, font and icons pass through here.

const CACHE_PREFIX = 'rxpdf-cool-';
const CACHE_VERSION = '1.0.0-392da2a255';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const PRECACHE = [
  /* PRECACHE:START */
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/pdfjs/pdf.worker.min.js',
  './vendor/inter/InterVariable.woff2',
  './assets/favicon.ico',
  './assets/favicon-32x32.png',
  './assets/icon-rxpdf-cool.png',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-512.png',
  './assets/pwa/maskable-512.png',
  './assets/pwa/apple-touch-icon.png',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdf-lib/pdf-lib.min.js',
  './vendor/jszip/jszip.min.js',
  './assets/css/theme.css?v=2a538e84',
  './assets/css/layout.css?v=2772c8f6',
  './assets/css/components.css?v=dbc60f0a',
  './assets/css/editor.css?v=111a5759',
  './assets/css/responsive.css?v=f8612051',
  './js/i18n-data.js?v=a3c0cf29',
  './js/i18n.js?v=d93ecf38',
  './js/core.js?v=cdffd23a',
  './js/split.js?v=4cb5bd08',
  './js/merge.js?v=45de4f08',
  './js/tools.js?v=7c1e4926',
  './js/editor.js?v=f79a7fd6',
  './js/app.js?v=9741884c',
  './js/pwa.js?v=4fe4f89e',
  /* PRECACHE:END */
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isHashed(url) {
  return url.searchParams.has('v');
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App shell: always try the network first so a fresh deploy is picked up,
  // but never leave the user without the app when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  // Versioned CSS/JS/vendor: safe to serve from cache forever.
  if (isHashed(url)) {
    event.respondWith(
      caches.match(request).then(hit => {
        if (hit) return hit;
        return fetch(request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Icons, font, manifest, anything else: serve cached, refresh in background.
  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});