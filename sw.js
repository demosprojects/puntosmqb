const CACHE_NAME = 'mqb-admin-v1.1';

// Solo instalamos y activamos el service worker
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Interceptamos las peticiones, pero dejamos que pasen directo a la red (sin caché complejo)
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
