const CACHE_NAME = 'activite-surprise-v2';
const STATIC_ASSETS = [
    './images/Icon_Activite-Surprise_192x192.png',
    './images/Icon_Activite-Surprise_512x512.png',
    './images/screenshot-mobile.jpg',
    './images/screenshot-desktop.jpg'
];

const DYNAMIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([...STATIC_ASSETS, ...DYNAMIC_ASSETS]);
        })
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            clients.claim(),
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
                );
            })
        ])
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Strategy: Cache-First for static images
    if (url.pathname.includes('/images/')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request);
            })
        );
        return;
    }

    // Strategy: Stale-While-Revalidate for logic/markup
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchedResponse = fetch(event.request).then((networkResponse) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                }).catch(() => cachedResponse); // Return cached if network fails

                return cachedResponse || fetchedResponse;
            });
        })
    );
});

