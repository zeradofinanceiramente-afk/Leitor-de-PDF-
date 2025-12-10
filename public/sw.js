// Nome do cache
const CACHE_NAME = 'pdf-annotator-v8-offline-ready';

// Arquivos para cachear imediatamente (App Shell)
const urlsToCache = [
  '/',
  '/index.html',
  '/?utm_source=pwa', // Importante para o launcher do Android
  '/manifest.json',
  
  // Bibliotecas Essenciais (ImportMap)
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0',
  'https://aistudiocdn.com/firebase@^12.6.0', // Loader principal do Firebase
  'https://aistudiocdn.com/lucide-react@^0.555.0',
  'https://aistudiocdn.com/pdf-lib@^1.17.1',
  'https://aistudiocdn.com/idb@^8.0.3',
  'https://aistudiocdn.com/vite@^7.2.6',
  'https://aistudiocdn.com/@vitejs/plugin-react@^5.1.1',
  
  // PDF.js & Workers
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/+esm',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/web/pdf_viewer.css',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs',
  
  // ESM Externals
  'https://esm.sh/@google/genai',
  'https://esm.sh/react-window@1.8.10?external=react,react-dom',
  'https://esm.sh/react-virtualized-auto-sizer@1.0.24?external=react,react-dom',

  // Assets Visuais e Fontes
  'https://cdn-icons-png.flaticon.com/512/337/337946.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Arimo:ital,wght@0,400;0,700;1,400;1,700&family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap'
];

// Instalação do SW
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching App Shell & Dependencies');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
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
      .then(() => self.clients.claim())
  );
});

// Helper para validar se devemos cachear a resposta
function isValidResponse(response) {
  if (!response || response.status !== 200) return false;
  // Permite 'basic' (mesmo domínio) e 'cors' (CDNs externos como aistudiocdn, jsdelivr, etc)
  const type = response.type;
  return type === 'basic' || type === 'cors';
}

// Estratégia de Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Ignorar requisições que não devem ser cacheadas (APIs, Manifest, etc)
  // Nota: manifest.json está no cache, mas geralmente queremos ele fresco ou da rede. 
  // Se estiver no cacheToUrls, será pego pela estratégia abaixo.
  if (url.pathname.includes('.well-known') || 
      url.pathname.endsWith('assetlinks.json') ||
      url.protocol === 'chrome-extension:') {
    return; // Network only
  }

  // 2. Ignorar chamadas de API do Google/Firebase (Firestore, Drive, Auth), EXCETO Fontes
  // url.hostname.includes('googleapis.com') bloquearia fonts.googleapis.com se não tratássemos.
  if ((url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts.googleapis.com')) || 
      (url.hostname.includes('firebase') && !url.hostname.includes('cdn') && !url.hostname.includes('aistudiocdn')) || 
      url.hostname.includes('firestore')) {
    return; 
  }

  // 3. Estratégia Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request, { ignoreSearch: url.pathname === '/' }) // Ignora query params apenas para a raiz
      .then((cachedResponse) => {
        // Se houver cache, retorna imediatamente
        if (cachedResponse) {
          // Atualiza o cache em segundo plano (se online)
          fetch(event.request).then((networkResponse) => {
            if (isValidResponse(networkResponse)) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          }).catch(() => {
            // Falha silenciosa na atualização em background (offline)
          });
          
          return cachedResponse;
        }

        // Se não houver cache, busca na rede
        return fetch(event.request).then((networkResponse) => {
          if (isValidResponse(networkResponse)) {
             const responseToCache = networkResponse.clone();
             caches.open(CACHE_NAME).then((cache) => {
               cache.put(event.request, responseToCache);
             });
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Fallback final para offline se tudo falhar.
        // Se for uma navegação para HTML e falhar, poderíamos retornar uma página offline customizada.
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