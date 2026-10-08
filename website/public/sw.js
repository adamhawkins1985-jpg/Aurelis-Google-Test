// Aurelis HUD Service Worker for Windows PWA Desktop Installation
const CACHE_NAME = 'aurelis-hud-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy to ensure live crypto data is always fresh
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
