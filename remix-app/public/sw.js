const CACHE_NAME = "td-one-pwa-v2";
const OFFLINE_URL = "/offline.html";

const STATIC_ASSETS = [
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg",
];

const EMPLOYEE_UI_ROUTES = new Set([
  "/",
  "/home",
  "/login",
  "/dashboard",
  "/day-work",
  "/day-work/view",
  "/request",
  "/request/leave",
  "/request/ot",
  "/request/time-correction",
  "/slip",
  "/slip/salary",
  "/slip/ot",
  "/scan",
  "/set-password",
  "/change-password",
  "/forgot-password",
  "/reset-password",
  "/activate",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/build/") ||
    pathname.startsWith("/icons/") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp")
  );
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        });
      })
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok && EMPLOYEE_UI_ROUTES.has(url.pathname)) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(event.request);
          if (cachedPage) return cachedPage;
          const cachedLogin = await caches.match("/login");
          if (cachedLogin) return cachedLogin;
          return caches.match(OFFLINE_URL);
        })
    );
  }
});
