/* Tayyibat System PWA service worker.
   Uses the deployment directory as its base, tolerates missing optional shell assets,
   and never clears localStorage or previous browser caches. */
const CACHE_VERSION = "tayyibat-system-v2.0.2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./system-engine.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];
const appURL = path => new URL(path, self.registration.scope).href;
const indexURL = appURL("./index.html");

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const results = await Promise.allSettled(APP_SHELL.map(path => cache.add(appURL(path))));
    const failures = results.map((result, index) => result.status === "rejected" ? APP_SHELL[index] : null).filter(Boolean);
    if (failures.length) console.warn("Tayyibat offline cache skipped unavailable app-shell files:", failures);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  // Keep older browser caches intact; a new worker reads only CACHE_VERSION.
  // This avoids deleting site data/cache automatically while still claiming the page.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const isNavigation = request.mode === "navigate" || request.destination === "document";
    if (isNavigation) {
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (_) {
        return (await cache.match(request)) || (await cache.match(indexURL)) || Response.error();
      }
    }

    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch (_) {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
