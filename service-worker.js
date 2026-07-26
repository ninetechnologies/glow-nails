const CACHE_NAME = "glow-nails-v5";
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "./icon-192.svg",
  "./icon-512.svg"
];

// Install — cache shell
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first, fallback to cache
self.addEventListener("fetch", e => {
  // Skip non-GET and cross-origin requests
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  // Skip Firebase Messaging SW (laisser le SW FCM gérer ses propres requêtes)
  if (e.request.url.includes("firebase-messaging-sw.js")) return;
  if (e.request.url.includes("/firebase-cloud-messaging-push-scope")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Ne jamais mettre en cache une réponse d'erreur (502/504 pendant un deploy)
        // sinon elle est servie en fallback offline = écran blanc persistant
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
