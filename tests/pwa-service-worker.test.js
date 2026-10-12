const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const listeners = {};
const added = [];
const deletedCaches = [];
let claimed = 0;
let skipped = 0;
let offlineMode = false;
const cache = {
  async add(url) {
    added.push(url);
    if (url.endsWith("/icons/icon-512.png")) throw new Error("simulate a single missing optional asset");
  },
  async match(request) {
    const url = typeof request === "string" ? request : request.url;
    if (url.endsWith("/index.html")) return new Response("cached page", { status: 200 });
    return undefined;
  },
  async put() {}
};
const self = {
  registration: { scope: "https://example.github.io/Tayyibat-System-Source/" },
  location: { origin: "https://example.github.io" },
  clients: { async claim() { claimed++; } },
  addEventListener(type, callback) { listeners[type] = callback; },
  async skipWaiting() { skipped++; }
};
const caches = {
  async open() { return cache; },
  async keys() { return ["tayyibat-system-v2.0.1", "some-other-cache"]; },
  async delete(key) { deletedCaches.push(key); }
};
const context = {
  self, caches, URL, Response, console: { warn() {} },
  async fetch() { if (offlineMode) throw new Error("offline"); return new Response("network", { status: 200 }); }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8"), context);

(async () => {
  let installPromise;
  listeners.install({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.equal(skipped, 1, "a failed optional cache entry must not block worker installation");
  assert.equal(added.length, 7);
  assert(added.every(url => url.startsWith("https://example.github.io/Tayyibat-System-Source/")), "shell URLs must respect the GitHub Pages project path");

  let activatePromise;
  listeners.activate({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;
  assert.equal(claimed, 1);
  assert.deepEqual(deletedCaches, [], "activation must not automatically delete existing caches");

  offlineMode = true;
  let responsePromise;
  listeners.fetch({
    request: { method: "GET", url: "https://example.github.io/Tayyibat-System-Source/missing.js", mode: "no-cors", destination: "script" },
    respondWith(promise) { responsePromise = promise; }
  });
  const resourceResponse = await responsePromise;
  assert.equal(resourceResponse.type, "error", "an uncached script must not be replaced with index.html when offline");

  let navigationPromise;
  listeners.fetch({
    request: { method: "GET", url: "https://example.github.io/Tayyibat-System-Source/some/deep/link", mode: "navigate", destination: "document" },
    respondWith(promise) { navigationPromise = promise; }
  });
  const navigationResponse = await navigationPromise;
  assert.equal(await navigationResponse.text(), "cached page", "offline navigations may fall back to the cached app shell");

  console.log("Tayyibat PWA service-worker tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
