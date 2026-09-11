const CACHE = "keiazotilt-routing-v1";
const TESTING_SHELL = [
  "/testing/",
  "/testing/index.html",
  "/assets/style.css",
  "/assets/app.js",
  "/assets/motion.js",
  "/assets/renderer.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(TESTING_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Network-first is intentional after the route swap so previously installed
  // Home Screen copies cannot keep serving the old cached root experience.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && url.pathname.startsWith("/testing")) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate" && url.pathname.startsWith("/testing")) {
          return caches.match("/testing/index.html");
        }
        return Response.error();
      })
  );
});
