
// Import Workbox
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

const CACHE_NAME = 'pdf-annotator-v11-workbox';
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

// Assets to precache (App Shell + Critical CDNs + Local Icons)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/shortcut-files-192.png',
  '/icons/shortcut-mindmap-192.png',
  '/icons/filehandler-512.png',
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0',
  'https://aistudiocdn.com/firebase@^12.6.0',
  'https://aistudiocdn.com/lucide-react@^0.555.0',
  'https://aistudiocdn.com/pdf-lib@^1.17.1',
  'https://aistudiocdn.com/idb@^8.0.3',
  'https://aistudiocdn.com/vite@^7.2.6',
  'https://aistudiocdn.com/@vitejs/plugin-react@^5.1.1',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/+esm',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/web/pdf_viewer.css',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs',
  'https://esm.sh/@google/genai',
  'https://esm.sh/react-window@1.8.10?external=react,react-dom',
  'https://esm.sh/react-virtualized-auto-sizer@1.0.24?external=react,react-dom',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Arimo:ital,wght@0,400;0,700;1,400;1,700&family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
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
    url.hostname.includes('aistudiocdn.com'),
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

// Background Sync stub (for future use)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-annotations') {
    console.log('[SW] Background sync triggered');
  }
});
