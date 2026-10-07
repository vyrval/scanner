// Service worker du Carnet.
// - Fichiers de l'appli : réseau d'abord (toujours la dernière version en ligne,
//   plus de mélange ancien/nouveau code), cache en secours hors ligne.
// - Polices Google et lecteur de code-barres : cache, mis à jour en arrière-plan.
// - Open Food Facts : jamais mis en cache ici (l'appli garde déjà les produits).

// La préproduction (/staging/) a son propre cache, que la prod ne touche pas.
const STAGING = self.location.pathname.includes("/staging/");
const PREFIX = STAGING ? "carnet-staging-v" : "carnet-v";
const CACHE = PREFIX + "1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/app.js", "js/store.js", "js/off.js", "js/scanner.js", "js/util.js",
  "js/activities.js", "js/quality.js", "js/version.js", "js/env.js", "js/ciqual.js", "data/ciqual.json",
  "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];
const RUNTIME_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // no-cache : on revalide auprès de GitHub Pages au lieu du cache HTTP (10 min).
    const res = await fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" }));
    if (res.ok) cache.put(req.url.split("#")[0], res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return cache.match("index.html");
    throw new Error("hors ligne");
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const update = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || update;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // La portée de la prod (/scanner/) englobe /scanner/staging/ : on laisse la préproduction tranquille.
  if (!STAGING && url.pathname.includes("/staging/")) return;
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (RUNTIME_HOSTS.includes(url.hostname)) e.respondWith(staleWhileRevalidate(req));
  // le reste (Open Food Facts…) passe directement par le réseau
});
