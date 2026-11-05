// Pacific Defence - Universal Scope-Aware Service Worker
const CACHE_NAME = 'pacific-defence-cache-v2';

// Resolve base path dynamically from the service worker's registered scope
const getBasePath = () => {
  try {
    const scopePath = new URL(self.registration ? self.registration.scope : self.location.href).pathname;
    return scopePath.endsWith('/') ? scopePath : scopePath + '/';
  } catch(e) {
    return './';
  }
};

const BASE = getBasePath();

const PRECACHE_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'favicon.ico',
  BASE + 'favicon.png',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'icons/icon-maskable-192.png',
  BASE + 'icons/icon-maskable-512.png',
  BASE + 'icons/icon.svg',
  BASE + 'lib/three.min.js',
  BASE + 'lib/GLTFLoader.js',
  BASE + 'lib/tailwindcss.js'
];

// Pre-cache core assets on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Purge obsolete cache versions on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Cache-first strategy for game assets with dynamic network caching
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests and non-http(s) schemes
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately, fetch update in background
        fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
          }
        }).catch(() => {/* Offline */});
        return cachedResponse;
      }

      // Not in cache, fetch from network and store in cache
      return fetch(req).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Cache 3D models, CDN libraries, fonts, and local assets
        const shouldCache = 
          url.origin === self.location.origin ||
          url.hostname.includes('cdnjs.cloudflare.com') ||
          url.hostname.includes('cdn.jsdelivr.net') ||
          url.hostname.includes('cdn.tailwindcss.com') ||
          url.hostname.includes('fonts.googleapis.com') ||
          url.hostname.includes('fonts.gstatic.com');

        if (shouldCache) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }

        return networkResponse;
      }).catch((err) => {
        // Fallback for navigation requests when completely offline
        if (req.mode === 'navigate') {
          return caches.match(BASE + 'index.html') || caches.match(BASE);
        }
        throw err;
      });
    })
  );
});
