/* Sadiq planner service worker — makes the app open instantly and work offline. */
const VERSION = "sadiq-planner-v1.4.0";
const SHELL = "sadiq-planner-" + VERSION;
const PRECACHE = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/favicon-48.png", "icons/icon-96.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("sadiq-planner-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // Google sign-in and Drive go straight to the network
  if (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith(".webmanifest")) {
    // network first so updates arrive; cached copy when offline
    e.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((r) => {
          if (r.ok) {
            const cp = r.clone();
            caches.open(SHELL).then((c) => c.put(req.mode === "navigate" ? "index.html" : req, cp));
          }
          return r;
        })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match("index.html"))),
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
