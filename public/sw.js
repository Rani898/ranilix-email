// Ranilix service worker: lets the site install as an app, open offline,
// and show "new mail" notifications even when the site is closed.
const CACHE = "ranilix-v1";
const PREFS = "ranilix-prefs";
const SHELL = ["./", "./manifest.webmanifest", "./favicon.svg", "./icons/icon-192.png", "./icons/badge-72.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PREFS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API calls and fonts go straight to the network

  // Pages: always try the network first (so updates show up), fall back to the saved copy offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  // Built files have a hash in their name, so a saved copy is always correct.
  if (url.pathname.includes("/assets/") || url.pathname.includes("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      })),
    );
  }
});

// The page tells us the language so notifications use it.
self.addEventListener("message", (event) => {
  if (event.data && (event.data.lang === "he" || event.data.lang === "en")) {
    event.waitUntil(caches.open(PREFS).then((c) => c.put("./lang", new Response(event.data.lang))));
  }
});

async function lang() {
  try {
    const res = await (await caches.open(PREFS)).match("./lang");
    return res ? await res.text() : "en";
  } catch { return "en"; }
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const he = (await lang()) === "he";
    await self.registration.showNotification(he ? "מייל חדש ב-Ranilix" : "New email in Ranilix", {
      body: he ? "לחצו כדי לפתוח את תיבת הדואר" : "Tap to open your inbox",
      icon: "./icons/icon-192.png",
      badge: "./icons/badge-72.png",
      tag: "ranilix-new-mail",
      renotify: true,
      lang: he ? "he" : "en",
      dir: he ? "rtl" : "ltr",
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL("./inbox", self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); if ("navigate" in open && !open.url.includes("/inbox")) await open.navigate(target); return; }
    await self.clients.openWindow(target);
  })());
});
