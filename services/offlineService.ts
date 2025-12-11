
const CACHE_NAME = 'pdf-annotator-offline-manual-v1';

export async function cacheAppResources(onProgress?: (progress: number) => void): Promise<string> {
  const cache = await caches.open(CACHE_NAME);
  let totalBytes = 0;

  // 1. Core Static Assets (Always required)
  const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/web/pdf_viewer.css',
    // Fonts defined in index.html
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Arimo:ital,wght@0,400;0,700;1,400;1,700&family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap'
  ];

  // 2. Discover Dynamic Assets from index.html (Scripts, CSS, ImportMap)
  try {
     const res = await fetch('/index.html?t=' + Date.now());
     if (res.ok) {
         const html = await res.text();
         const parser = new DOMParser();
         const doc = parser.parseFromString(html, 'text/html');

         // Import Map (Dependencies)
         const importMap = doc.querySelector('script[type="importmap"]');
         if (importMap && importMap.textContent) {
            try {
               const json = JSON.parse(importMap.textContent);
               if (json.imports) {
                  Object.values(json.imports).forEach((u: any) => {
                      if (typeof u === 'string') urlsToCache.push(u);
                  });
               }
            } catch(e) {
                console.warn("Error parsing importmap", e);
            }
         }

         // Module Scripts (e.g., /index.tsx or /assets/index.js)
         doc.querySelectorAll('script[src]').forEach(s => {
             const src = s.getAttribute('src');
             // Skip http/https unless it's a known resource, mainly target relative or root paths
             if (src) urlsToCache.push(src);
         });
         
         // Stylesheets
         doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
             const href = l.getAttribute('href');
             if (href) urlsToCache.push(href);
         });
     }
  } catch (e) {
      console.warn("Could not parse index.html for dynamic assets", e);
  }

  // 3. Deduplicate URLs
  const uniqueUrls = Array.from(new Set(urlsToCache));
  
  // 4. Fetch and Cache
  let completed = 0;
  await Promise.all(uniqueUrls.map(async (url) => {
      try {
          // Use no-cache to ensure we get fresh versions to store
          const req = new Request(url, { cache: 'no-cache', mode: 'cors' });
          const res = await fetch(req);
          if (res.ok) {
              // Clone the response to read the blob size without consuming the body for cache
              const clone = res.clone();
              const blob = await clone.blob();
              totalBytes += blob.size;
              
              await cache.put(req, res);
          }
      } catch (e) {
          console.warn(`Failed to cache ${url}`, e);
      } finally {
          completed++;
          if (onProgress) onProgress(Math.round((completed / uniqueUrls.length) * 100));
      }
  }));

  // Return formatted size
  const mb = totalBytes / (1024 * 1024);
  if (mb < 1) {
      return `${(totalBytes / 1024).toFixed(0)} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * Verifica se o cache existe e calcula seu tamanho total.
 * Usado para persistir o estado "Baixado" na UI.
 */
export async function getOfflineCacheSize(): Promise<string | null> {
  if (!('caches' in window)) return null;

  const hasCache = await caches.has(CACHE_NAME);
  if (!hasCache) return null;

  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  
  // Se o cache existe mas está vazio, consideramos não baixado
  if (keys.length === 0) return null;

  let totalBytes = 0;
  // Iteramos para somar o tamanho (pode ser custoso se houver milhares de arquivos, 
  // mas para um app PWA é geralmente rápido)
  try {
    for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
            const blob = await response.clone().blob();
            totalBytes += blob.size;
        }
    }
  } catch (e) {
      console.warn("Erro ao calcular tamanho do cache", e);
      return null;
  }

  const mb = totalBytes / (1024 * 1024);
  if (mb < 1) {
      return `${(totalBytes / 1024).toFixed(0)} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}
