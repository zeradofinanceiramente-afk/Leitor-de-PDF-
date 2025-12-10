// Nome do cache
const CACHE_NAME = 'pdf-annotator-v6';

// Arquivos para cachear imediatamente (App Shell)
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/web/pdf_viewer.css',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs',
  'https://cdn-icons-png.flaticon.com/512/337/337946.png',
  'https://aistudiocdn.com/lucide-react@^0.555.0'
];

// Instalação do SW
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching App Shell');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Clearing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia de Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Arquivos críticos de configuração (Network Only)
  // IMPORTANTE: Nunca cachear assetlinks.json para não quebrar a verificação do TWA (Barra do topo)
  if (url.pathname.endsWith('manifest.json') || 
      url.pathname.includes('.well-known') || 
      url.pathname.endsWith('assetlinks.json')) {
    return; // Network only
  }

  // 2. Ignorar chamadas de API do Google/Firebase
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('firebase') || 
      url.hostname.includes('firestore')) {
    return; 
  }

  // 3. Fontes do Google (Cache First, Fallback Network)
  if (url.hostname.includes('fonts.googleapis.com') || 
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          return response || fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 4. Stale-While-Revalidate para App Shell
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if(networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
             const responseToCache = networkResponse.clone();
             caches.open(CACHE_NAME).then((cache) => {
               cache.put(event.request, responseToCache);
             });
          }
          return networkResponse;
        }).catch(() => {});

        return response || fetchPromise;
      })
  );
});

// --- CAPABILITIES STUBS (PWABuilder Detection) ---
self.addEventListener('push', (event) => {
  const title = 'Leitor de PDF';
  const options = {
    body: event.data ? event.data.text() : 'Nova notificação',
    icon: 'https://cdn-icons-png.flaticon.com/512/337/337946.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/337/337946.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-annotations') {
    console.log('[SW] Background sync triggered');
  }
});