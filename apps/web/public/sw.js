/*
 * Bonus service worker (BONUS-9).
 *
 * Rules:
 *  - Only same-origin GET requests are ever looked at.
 *  - Never touched (the browser handles them as if there were no SW):
 *    /api (incl. upcoming /api/accounts/*\/secret*), /mcp, OAuth (/authorize, /token,
 *    /register, /.well-known), Cloudflare (/cdn-cgi, incl. the Access login callback),
 *    and any request carrying an Authorization header.
 *  - Only content-hashed build output (/assets/*) and a few static PWA files are cached.
 *    HTML (index.html) is never cached: it sits behind Cloudflare Access.
 *  - Navigations go to the network (so an expired Access session redirects to the GitHub
 *    login as usual); only when the network is unreachable is the offline page shown.
 */
const VERSION = "v2";
const STATIC_CACHE = `bonus-static-${VERSION}`;
const ASSET_CACHE = "bonus-assets"; // hashed file names: safe to keep across versions
// Workers Static Assets serves offline.html at /offline (html_handling drops the extension).
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icons/icon-192.png"];

const BYPASS = [/^\/api(\/|$)/, /^\/mcp(\/|$)/, /^\/authorize(\/|$)/, /^\/token(\/|$)/, /^\/register(\/|$)/, /^\/\.well-known\//, /^\/cdn-cgi\//];
const STATIC_FILES = new Set(PRECACHE.concat(["/icons/icon-512.png", "/icons/maskable-192.png", "/icons/maskable-512.png", "/icons/apple-touch-icon-180.png"]));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, ASSET_CACHE]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

function cacheable(res) {
  return res && res.ok && res.type === "basic" && !res.redirected;
}
// A missing /assets/* file falls back to index.html (SPA handling): never cache that.
function cacheableAsset(res) {
  return cacheable(res) && !(res.headers.get("content-type") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((re) => re.test(url.pathname))) return;
  if (req.headers.has("authorization")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Network only. Redirects (Access login) pass straight through to the browser.
          return (await event.preloadResponse) || (await fetch(req));
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    // Immutable, content-hashed: cache first.
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (cacheableAsset(res)) event.waitUntil(cache.put(req, res.clone()));
        return res;
      })(),
    );
    return;
  }

  if (STATIC_FILES.has(url.pathname)) {
    // Network first, cached copy when offline.
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (cacheable(res)) {
            const copy = res.clone();
            event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.put(req, copy)));
          }
          return res;
        } catch {
          return (await caches.match(req)) || Response.error();
        }
      })(),
    );
  }
  // Everything else: not intercepted.
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
