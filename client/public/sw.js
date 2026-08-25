// FiberDoc Service Worker — v5.96.50
// IMPORTANTE: Este SW se auto-desregistra imediatamente para evitar
// interferência com requisições de API em modo multi-tenant.
// O PWA foi desativado pois causava falhas no fetch de /api/local-auth-enabled.

self.addEventListener("install", () => {
  // Pular espera e ativar imediatamente para poder se desregistrar
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Limpar todos os caches e se auto-desregistrar
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => {
        // Recarregar todos os clientes para que funcionem sem SW
        return self.clients.matchAll({ type: "window" });
      })
      .then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      })
  );
});
