const CACHE_NAME = 'activite-surprise-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './images/Icon_Activite-Surprise_192x192.png',
  './images/Icon_Activite-Surprise_512x512.png',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
  'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW V3: Pre-caching assets');
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
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  // Skip Firebase/Firestore/Google Auth
  if (url.includes('googleapis.com') || url.includes('google.com') || url.includes('firebase')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cachedResponse = await cache.match(event.request);
      
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // IMPORTANT: We must NOT use the body before cloning
        if (networkResponse && networkResponse.status === 200) {
          // Clone BEFORE doing anything else
          const responseToCache = networkResponse.clone();
          cache.put(event.request, responseToCache).catch(err => {
             console.warn('SW: Cache put failed', err);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
