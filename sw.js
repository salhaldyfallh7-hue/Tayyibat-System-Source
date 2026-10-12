/* Tayyibat System PWA service worker.
   Versioned app shell; HTML is network-first so a deployment is not trapped behind stale UI.
   User records live in localStorage and are never touched by cache cleanup. */
const CACHE_VERSION = "tayyibat-system-v2.0.1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./system-engine.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];
const CACHE_PREFIX = "tayyibat-";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
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
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(request)) || (await cache.match("./index.html")) || Response.error();
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    } catch (_) {
      return (await cache.match("./index.html")) || Response.error();
    }
  })());
});
