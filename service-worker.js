const CACHE_PREFIX = "santbani-bm-";
const CACHE_NAME = `${CACHE_PREFIX}static-v1.1`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=1.1",
  "./icons.js?v=1.1",
  "./app.js?v=1.1",
  "./manifest.webmanifest?v=1.1",
  "./santbani-icon.svg",
  "./santbani-icon-180.png",
  "./santbani-icon-192.png",
  "./santbani-icon-512.png",
  "./covers/sr-bhajan-mala.png",
  "./covers/sj-bhajan-mala.png",
  "./sr/index.html",
  "./sr/styles.css?v=1.1",
  "./sr/icons.js?v=1.1",
  "./sr/data.js?v=1.1",
  "./sr/audio-map.js?v=1.1",
  "./sr/app.js?v=1.1",
  "./sr/audio-player.js?v=1.1",
  "./sr/audio-session-hold.wav",
  "./sr/sr-bm-icon-192.png",
  "./sr/sr-bm-icon-512.png",
  "./sj/index.html",
  "./sj/styles.css?v=1.1",
  "./sj/icons.js?v=1.1",
  "./sj/data.js?v=1.1",
  "./sj/bhajans.js?v=1.1",
  "./sj/audio-map.js?v=1.1",
  "./sj/app.js?v=1.1",
  "./sj/audio-player.js?v=1.1",
  "./sj/audio-session-hold.wav",
  "./sj/sj-bm-icon-192.png",
  "./sj/sj-bm-icon-512.png"
];

function offlinePageFor(url) {
  if (url.pathname.includes("/sr/")) return "./sr/index.html";
  if (url.pathname.includes("/sj/")) return "./sj/index.html";
  return "./index.html";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(offlinePageFor(url))));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
