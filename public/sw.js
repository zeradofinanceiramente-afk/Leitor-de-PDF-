
// Import Workbox
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

const CACHE_NAME = 'pdf-annotator-v13-shell';
const OFFLINE_PAGE = '/index.html';

workbox.setConfig({
  debug: false
});

// Force update on controller change
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Assets to precache (Critical Shell Only)
// Reduced list to avoid single point of failure during install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/web/pdf_viewer.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
          // Attempt to cache all, but log errors instead of failing hard if possible
          // Note: cache.addAll is atomic, so we stick to critical assets that MUST exist.
          return cache.addAll(APP_SHELL).catch(err => {
              console.warn("SW Install: Failed to cache some shell assets", err);
              // We do NOT re-throw, so the SW can still install. 
              // The manual offline download feature in the app can fill the gaps.
          });
      })
  );
});

// 1. Navigation (HTML): Network First -> Fallback to Cache -> Fallback to Offline Page
workbox.routing.registerRoute(
  ({ request }) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: 'pages-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Catch-all for navigation requests to serve index.html (SPA support)
workbox.routing.setCatchHandler(async ({ event }) => {
  if (event.request.destination === 'document') {
    return caches.match(OFFLINE_PAGE);
  }
  return Response.error();
});

// 2. Scripts, Styles, & CDNs: Stale While Revalidate (Performance + Offline)
workbox.routing.registerRoute(
  ({ request, url }) => 
    request.destination === 'script' || 
    request.destination === 'style' ||
    url.hostname.includes('cdn') || 
    url.hostname.includes('esm.sh') ||
    url.hostname.includes('aistudiocdn.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'assets-cache',
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200], // Handle opaque responses
      }),
    ],
  })
);

// 3. Images & Fonts: Cache First (Long Term Caching)
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new workbox.strategies.CacheFirst({
    cacheName: 'static-resources',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// 4. API Calls: Network Only (Let app handle errors)
workbox.routing.registerRoute(
  ({ url }) => 
    url.hostname.includes('googleapis.com') || 
    url.hostname.includes('firebase') || 
    url.hostname.includes('firestore'),
  new workbox.strategies.NetworkOnly()
);

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-annotations') {
    console.log('[SW] Background sync triggered');
  }
});
