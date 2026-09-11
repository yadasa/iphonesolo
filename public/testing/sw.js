const CACHE = "keiazotilt-testing-v1";
const SHELL = ["/testing/", "/testing/index.html"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("keiazotilt-testing-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith("/testing")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(cached => cached || caches.match("/testing/index.html"))));
});
