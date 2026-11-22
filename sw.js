/* Sadiq planner service worker — makes the app open quickly and work offline. */
const VERSION = "sadiq-planner-v1.7.1";
const SHELL = "sadiq-planner-" + VERSION;
const PRECACHE = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/favicon-48.png", "icons/icon-96.png"];
/** On a slow connection, don't wait longer than this for the newest version before opening the saved one. */
const NETWORK_WAIT_MS = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("sadiq-planner-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cachedPage(req) {
  const c = await caches.open(SHELL);
  return (await c.match(req, { ignoreSearch: true })) || (await c.match("index.html")) || (await c.match("./"));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only the planner's own files. Google sign-in, Firebase and the SEC site always go straight to the network.
  if (req.method !== "GET" || url.origin !== location.origin || !url.pathname.includes("/sadiq-planner/")) return;

  if (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith(".webmanifest")) {
    // Newest version first, but never leave the app hanging: after a few seconds, open the saved copy
    // and let the download finish in the background for next time.
    const network = fetch(req, { cache: "no-cache" }).then(async (r) => {
      if (r.ok) {
        const c = await caches.open(SHELL);
        await c.put(req.mode === "navigate" ? "index.html" : req, r.clone());
      }
      return r;
    });
    e.waitUntil(network.catch(() => {}));
    e.respondWith(
      (async () => {
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_WAIT_MS));
        try {
          const first = await Promise.race([network, timeout]);
          if (first && first.ok) return first;
          const saved = await cachedPage(req);
          if (saved) return saved;
          return await network; // nothing saved yet: keep waiting for the network
        } catch {
          return (await cachedPage(req)) || Response.error();
        }
      })(),
    );
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
