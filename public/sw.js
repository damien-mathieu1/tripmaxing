const CACHE = "tripmaxing-v1";
const TRIP_CACHES = "tripmaxing-trip-";
// Hosts of what a saved trip stores: base map tiles, photos and summaries.
const TRIP_HOSTS = /(^|\.)(maps\.eox\.at|wikimedia\.org|wikipedia\.org)$/;
const MAX_TILES = 800;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE && !key.startsWith(TRIP_CACHES))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function trimTiles(cache) {
  const tiles = (await cache.keys()).filter((request) => request.url.includes("/api/tiles/"));
  await Promise.all(tiles.slice(0, -MAX_TILES).map((request) => cache.delete(request)));
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const update = fetch(event.request).then(async (response) => {
    if (response.ok) {
      await cache.put(event.request, response.clone());
      await trimTiles(cache);
    }
    return response;
  });
  if (!cached) return update;
  event.waitUntil(update.catch(() => {}));
  return cached;
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match("/")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) {
    if (TRIP_HOSTS.test(url.hostname)) {
      event.respondWith(caches.match(request).then((saved) => saved ?? fetch(request)));
    }
    return;
  }
  if (url.pathname.startsWith("/api/tiles/")) event.respondWith(staleWhileRevalidate(event));
  else if (url.pathname.startsWith("/api/")) return;
  else if (request.mode === "navigate") event.respondWith(networkFirst(request));
  else if (/^\/(_next\/static|icons)\/|^\/maplibre-gl-worker\.mjs$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
