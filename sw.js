// sw.js — Service Worker para Más que Burgers Puntos
const CACHE_NAME = 'mqb-puntos-v1';

// Archivos esenciales a cachear para que funcione offline básicamente
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/db.js',
  '/manifest.json'
];

// Instalación: cacheamos los estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activación: borramos cachés viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first para Firebase, cache-first para estáticos
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase, Firestore y CDNs siempre van a la red
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('imagedelivery.net') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('cdn.tailwindcss.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para todo lo demás: cache-first con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});