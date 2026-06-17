// Outage Observer service worker: Web Push (incl. iOS 16.4+ installed PWAs, via
// standard VAPID/aes128gcm) + a small offline shell cache so the installed app
// launches even with no network (live status still needs the network).

const CACHE = "oo-shell-v2";
const SHELL = ["/", "/app.js", "/board.css", "/tokens.css", "/favicon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  // Precache the shell FRESH (cache:"reload" bypasses any stale HTTP cache), so a
  // new SW version always seeds the current assets.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first for same-origin GETs: always fresh online, cached shell offline.
// Never intercept the API/debug paths — those must always hit the network.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/debug/")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || SHELL.includes(url.pathname))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match("/"))),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "Outage Observer";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "https://outage.observer/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "https://outage.observer/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Prefer an exact match; otherwise focus any open window; else open new.
      const exact = wins.find((w) => w.url === url);
      if (exact && "focus" in exact) return exact.focus();
      if (wins.length && "focus" in wins[0]) { wins[0].focus(); return wins[0].navigate ? wins[0].navigate(url) : undefined; }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
