const CACHE_NAME = "cross-js-v2";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/main.js",
  "/img/icon.ico",
  "/img/icon.svg",
  "/img/icon.png",
  "/img/iconEQ.png",
];

// Evento de instalación: pre-cachea el app shell
self.addEventListener("install", (installEvent) => {
  installEvent.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Evento de activación: limpia cachés antiguas
self.addEventListener("activate", (activateEvent) => {
  activateEvent.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Borrando caché antigua:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Evento fetch: Estrategia Network falling back to Cache
self.addEventListener("fetch", (fetchEvent) => {
  fetchEvent.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return fetch(fetchEvent.request)
        .then((networkResponse) => {
          // Si la petición a la red es exitosa, la cacheamos
          cache.put(fetchEvent.request, networkResponse.clone());
          return networkResponse;
        })
        .catch(() => {
          // Si la red falla, buscamos en la caché
          return cache.match(fetchEvent.request);
        });
    })
  );
});