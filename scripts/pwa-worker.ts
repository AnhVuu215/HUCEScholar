// Compiled to public/sw.js by pwa-assets.mjs. No imports or runtime dependencies.
const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE_PREFIX = 'hucescholar-public-';
const CACHE = `${CACHE_PREFIX}v1`;
const OFFLINE = '/offline.html';
const PUBLIC_ASSETS = [
  OFFLINE,
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Fetch all assets before writing. Never precache a credentialed response or redirect.
      const entries = await Promise.all(
        PUBLIC_ASSETS.map(async (path) => {
          const request = new Request(new URL(path, worker.location.origin), {
            credentials: 'omit',
            cache: 'reload',
            redirect: 'error',
          });
          const response = await fetch(request);
          if (!response.ok || response.type !== 'basic')
            throw new Error('Public asset unavailable');
          return { request, response };
        }),
      );
      const cache = await caches.open(CACHE);
      await Promise.all(entries.map(({ request, response }) => cache.put(request, response)));
    })(),
  );
  // Deliberately no skipWaiting: updates must not interrupt an open note/draft.
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== worker.location.origin ||
    url.search ||
    request.headers.has('Authorization') ||
    request.headers.has('Range')
  )
    return;

  if (PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => (await (await caches.open(CACHE)).match(request)) ?? fetch(request))(),
    );
    return;
  }

  const appNavigation =
    ['/', '/login', '/project', '/install', '/workspace'].includes(url.pathname) ||
    url.pathname.startsWith('/workspace/');
  if (request.mode !== 'navigate' || !appNavigation) return;
  // No runtime writes: API, PDFs, RSC, notes and all HTML responses stay network-only.
  // HTTP errors are real responses; only a failed connection uses the public fallback.
  event.respondWith(
    fetch(request).catch(
      async () => (await (await caches.open(CACHE)).match(OFFLINE)) ?? Response.error(),
    ),
  );
});
