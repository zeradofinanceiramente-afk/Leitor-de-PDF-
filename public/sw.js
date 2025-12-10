// Nome do cache
const CACHE_NAME = 'pdf-annotator-v7';

// Arquivos para cachear imediatamente (App Shell)
const urlsToCache = [
  '/',
  '/index.html',
  '/?utm_source=pwa', // Importante para o launcher do Android
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
  if (url.pathname.endsWith('manifest.json') || 
      url.pathname.includes('.well-known') || 
      url.pathname.endsWith('assetlinks.json') ||
      url.protocol === 'chrome-extension:') {
    return; // Network only
  }

  // 2. Ignorar chamadas de API do Google/Firebase (Firestore, Drive, Auth)
  // Nota: Verificamos o hostname para garantir que não estamos bloqueando os scripts da biblioteca (que vêm de aistudiocdn)
  if (url.hostname.includes('googleapis.com') || 
      (url.hostname.includes('firebase') && !url.hostname.includes('cdn')) || 
      url.hostname.includes('firestore')) {
    return; 
  }

  // 3. Estratégia Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request, { ignoreSearch: url.pathname === '/' }) // Ignora query params apenas para a raiz (evita falha em /?utm_source=pwa se não estiver exato no cache)
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
        // Fallback final para offline se tudo falhar (opcional, aqui retornamos nada para deixar o browser lidar ou poderíamos retornar um index.html offline)
        // Como o cache.match já deve ter pego o index.html, isso raramente ocorre para a navegação principal
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