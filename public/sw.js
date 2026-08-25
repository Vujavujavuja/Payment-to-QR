/**
 * Service worker.
 *
 * Hand-written rather than generated. It is short enough to read in one go,
 * and for an app that produces payment instructions it matters that a
 * maintainer can see exactly what is served from cache and what is not.
 *
 * The offline goal is specific: typing a payment in by hand and getting a QR
 * code out must work with no connection at all. Encoding, validation and QR
 * rendering are pure client-side code, so the only thing standing between a
 * user with no signal and a working payment code is the app shell.
 */

const VERSION = 'v1';
const SHELL_CACHE = `p2qr-shell-${VERSION}`;
const ASSET_CACHE = `p2qr-assets-${VERSION}`;
const OCR_CACHE = `p2qr-ocr-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, OCR_CACHE];

/**
 * Where tesseract.js fetches its worker, its wasm core, and the Serbian and
 * English language data. Every one of these URLs pins a version, so the
 * content behind a given URL never changes and cache-first is safe.
 *
 * This is the difference between "the app opens offline" and "reading a slip
 * works offline". The language data is tens of megabytes, which is also why
 * it is only ever cached as a side effect of a scan the user already ran --
 * nothing is downloaded speculatively.
 */
const OCR_HOST = 'cdn.jsdelivr.net';
const OCR_PATHS = [
  '/npm/tesseract.js@',
  '/npm/tesseract.js-core@',
  '/npm/@tesseract.js-data/',
];

function isOcrAsset(url) {
  return url.hostname === OCR_HOST && OCR_PATHS.some((p) => url.pathname.startsWith(p));
}

/** Enough to boot the app with no network. Hashed bundles arrive at runtime. */
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, not addAll: addAll rejects the whole install if any one
      // URL fails, which would leave the app with no worker at all over a
      // single missing icon.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('p2qr-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      // Claim without forcing a reload. The page keeps the JavaScript it
      // already loaded; only later requests go through this worker.
      await self.clients.claim();
    })(),
  );
});

/** Immutable by URL — Next puts a content hash in the filename. */
function isHashedAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network first, cache as fallback.
 *
 * Deliberately not the other way round for documents: this app encodes money
 * transfers, and serving a stale bundle to save a few hundred milliseconds is
 * the wrong trade. Cache is what you get when the network genuinely fails.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) ?? (await caches.match('/'));
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is cacheable, and only our own origin is ours to serve.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // The one cross-origin exception. jsdelivr sends permissive CORS headers,
  // so these are real inspectable responses rather than opaque ones.
  if (isOcrAsset(url)) {
    event.respondWith(cacheFirst(request, OCR_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Never cache the extraction endpoint. A cached "available: false" would
  // hide a key the operator has since configured, and a cached extraction
  // would show one document's fields for another's image.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, ASSET_CACHE));
});
