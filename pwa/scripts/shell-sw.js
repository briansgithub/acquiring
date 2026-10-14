/* Shell assets only. Catalogs, API responses and user records have separate owners. */
const CACHE_PREFIX = 'acquiring-shell-';
const CACHE_NAME = CACHE_PREFIX + '__SHELL_VERSION__';
const ASSETS = __SHELL_ASSETS__;
const ASSET_PATHS = new Set(ASSETS);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  // A later update waits for existing clients to close; never replace an active audio session.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(CACHE_NAME)).match('/index.html');
      return cached || Response.error();
    }));
  } else if (ASSET_PATHS.has(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  }
});
