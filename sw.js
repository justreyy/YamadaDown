/* YAMADA DOWN service worker: cache cangkang aplikasi agar bisa dibuka
   seperti app. /api/* TIDAK PERNAH di-cache. */
const CACHE = "yamada-down-v6.0.0";
const SHELL = [
  "/", "/index.html", "/style.css", "/app.js", "/content.js", "/manifest.webmanifest",
  "/assets/ryo.webp", "/assets/ryo-sm.webp", "/assets/icon-192.png", "/assets/icon-512.png",
  "/LOGO.jpg", "/Youtube.jpg", "/Tiktok.jpg", "/Instagram.jpg", "/Pinterest.jpg", "/iPhone.jpg"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// Skrip jaringan iklan milik pemilik situs (sebelumnya satu-satunya isi sw.js).
// Dibungkus try/catch agar kegagalan memuatnya tidak merusak PWA.
try {
  self.options = { domain: "3nbf4.com", zoneId: 11684255 };
  self.lary = "";
  importScripts("https://3nbf4.com/act/files/service-worker.min.js?r=sw");
} catch (err) { /* abaikan */ }
