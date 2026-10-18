// Bear's service worker. The build (vite.config.ts) fills in the two lists below.

/** The launcher: cached on install so Bear opens instantly and offline. */
const SHELL = self.__SHELL__
/** Every built file in assets/; cached copies of files no longer in the build are dropped. */
const ASSETS = new Set(self.__ASSETS__)
const CACHE = 'bear'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      for (const request of await cache.keys()) {
        const asset = new URL(request.url).pathname.match(/\/(assets\/[^/]+)$/)
        if (asset && !ASSETS.has(asset[1])) await cache.delete(request)
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // The page itself: always try for the newest version, fall back to the cached one offline.
    const home = new URL('./', self.registration.scope).href
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(home, copy))
          }
          return response
        })
        .catch(() => caches.match(home).then((cached) => cached ?? Response.error()))
    )
    return
  }

  // Everything else is either content-hashed (assets/) or rarely changes (fonts, icons): serve the
  // cached copy, and fetch it once if it isn't cached yet.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
    )
  )
})
