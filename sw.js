// Beach Defence 1944 - Service Worker
const CACHE_NAME = 'beach-defence-cache-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon.svg',
  '/lib/three.min.js',
  '/lib/GLTFLoader.js'
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
        // Return cached version immediately, optionally fetch update in background
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
          return caches.match('/index.html') || caches.match('/');
        }
        throw err;
      });
    })
  );
});
