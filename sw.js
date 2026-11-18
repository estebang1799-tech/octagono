// Offline support: app files are cached on install; product shards are cached the first time they're used.
const VERSION = "octagono-1.0.0";
const SHELL = ["./", "index.html", "styles.css", "app.js", "logic.js", "vendor/zxing.min.js", "manifest.webmanifest",
  "fonts/anton.woff2", "fonts/worksans.woff2", "icons/icon-192.png", "icons/icon-512.png", "db/index.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // live API calls go straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) {
      // refresh app files in the background; product data only changes with a new version
      if (!url.pathname.includes("/db/")) fetch(e.request).then(r => r.ok && cache.put(e.request, r)).catch(() => {});
      return hit;
    }
    try { const r = await fetch(e.request); if (r.ok) cache.put(e.request, r.clone()); return r; }
    catch { return (await cache.match("index.html")) || Response.error(); }
  })());
});
