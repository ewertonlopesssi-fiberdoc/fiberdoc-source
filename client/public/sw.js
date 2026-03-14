// FiberDoc Service Worker — v5.95.0
// IMPORTANTE: altere APP_VERSION a cada release para forçar limpeza do cache
const APP_VERSION = "6.2.2";
const CACHE_NAME = `fiberdoc-${APP_VERSION}`;

// Recursos estáticos para cache imediato (app shell)
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// ─── Install: pré-cache do app shell ─────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Força activação imediata sem esperar pelo fecho de abas antigas
  self.skipWaiting();
});

// ─── Activate: limpar TODOS os caches antigos ────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Removendo cache antigo: " + key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
     .then(() =>
       self.clients.matchAll({ type: "window" }).then((clients) =>
         clients.forEach((client) =>
           client.postMessage({ type: "SW_UPDATED", version: APP_VERSION })
         )
       )
     )
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API: sempre rede, sem cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Assets com hash no nome (imutáveis): Cache-first
  const hasHash = /\/assets\/[^/]+-[A-Za-z0-9]{8,}\.(js|css)$/.test(url.pathname);
  if (hasHash) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Tudo o resto: Network-first (garante conteúdo fresco após actualizações)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
