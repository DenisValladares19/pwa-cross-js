const crossjs = "cross-js-v1";
const assets = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/main.js",
  "/img/icon.ico",
  "/img/icon.svg",
];

self.addEventListener("install", installEvent => {
  installEvent.waitUntil(
    caches.open(crossjs).then(cache => {
      cache.addAll(assets);
    })
  );
});

self.addEventListener("fetch", fetchEvent => {
  fetchEvent.respondWith(
    caches.match(fetchEvent.request).then(res => {
      return res || fetch(fetchEvent.request);
    })
  );
});
