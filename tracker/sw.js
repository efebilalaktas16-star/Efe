// Service worker: uygulama kabuğunu önbelleğe alır, internet olmadan da açılabilmesini sağlar.
// NOT: Harita karoları (OpenStreetMap) ve CDN kütüphaneleri ilk kullanımdan sonra
// fırsat buldukça (runtime) önbelleğe alınır; tamamen offline harita garantisi yoktur.
const CACHE_VERSION = 'v8';
const SHELL_CACHE = `wt-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `wt-runtime-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/storage.js',
  './js/geo.js',
  './js/utils.js',
  './js/mapview.js',
  './js/activity.js',
  './js/pedometer.js',
  './js/wakelock.js',
  './js/routes.js',
  './js/history.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.all(
        SHELL_ASSETS.map((url) => cache.add(url).catch((err) => console.warn('SW cache skip', url, err)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // Uygulama kabuğu: cache-first, arka planda güncelle.
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((resp) => {
            if (resp && resp.ok) {
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, resp.clone()));
            }
            return resp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Dış kaynaklar (Leaflet, Chart.js, OSM karoları): network-first, olursa cache'e düş.
  event.respondWith(
    fetch(request)
      .then((resp) => {
        if (resp && resp.ok) {
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, resp.clone()));
        }
        return resp;
      })
      .catch(() => caches.match(request))
  );
});
