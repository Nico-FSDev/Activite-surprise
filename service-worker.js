const CACHE_NAME = 'androlink-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/firebase-config.js',
  '/manifest.json',
  '/images/Icon_Activite-Surprise_192x192.png',
  '/images/Icon_Activite-Surprise_512x512.png',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
  'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: Pre-caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Stale-While-Revalidate)
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase/External API requests for now to avoid CORS/Auth issues in cache
  if (event.request.url.includes('google') || event.request.url.includes('firestore')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
