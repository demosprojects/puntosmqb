// sw.js — Service Worker para Más que Burgers Puntos
const CACHE_NAME = 'mqb-puntos-v4';

// Usamos la URL base del propio SW para construir rutas correctas
// sin importar en qué carpeta/subdominio esté el sitio
const BASE = self.location.href.replace('/sw.js', '');

const STATIC_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/app.js`,
  `${BASE}/db.js`,
  `${BASE}/manifest.json`
];

// Instalación: cacheamos los estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => {
        console.warn('SW: algunos assets no se cachearon', err);
      })
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

// Fetch: network-first para Firebase y CDNs, cache-first para estáticos
self.addEventListener('fetch', event => {
  // Solo manejamos GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Firebase, Firestore y CDNs siempre van a la red directamente
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('imagedelivery.net') ||
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return; // deja que el navegador lo maneje normalmente
  }

  // Para todo lo demás: cache-first con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // Si no hay red y no está en caché, devolvemos el index como fallback
        return caches.match(`${BASE}/index.html`);
      });
    })
  );
});
