/* YahBible Web service worker.
   Strategy split so code updates are never stale:
   - App code (index.html, the shim JS, this SW, navigations) = NETWORK-FIRST:
     always try the network, fall back to cache only when offline. This means a
     pushed fix applies on the very next reload, not the one after.
   - Big stable assets (sqlite-wasm, images, prebuilt static_api JSON) =
     CACHE-FIRST with a background refresh: fast and offline-capable.
   Data packs live in OPFS (the worker's business) and /api never hits network. */
"use strict";
const SHELL = "yahbible-shell-v88";
const ASSETS = [
  "vendor/sqlite-wasm/sqlite3.js", "vendor/sqlite-wasm/sqlite3.wasm",
  "assets/elan-fish.webp", "assets/scrollfish.png",
  "assets/icon-180.png", "assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

function isAsset(p) {
  return p.includes("/vendor/") || p.includes("/assets/") || p.includes("/static_api/") ||
         p.includes("/cosmos");
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // The iPhone edition reads Scripture from the HF per-book store (cross-origin).
  // Cache those small per-book JSONs so a book you've opened keeps working OFFLINE
  // (cache-first + background refresh). Other cross-origin requests pass through.
  if (url.hostname === "huggingface.co" && url.pathname.includes("/scripture/")) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit) {
        e.waitUntil((async () => { try { const fr = await fetch(e.request);
          if (fr.ok) (await caches.open(SHELL)).put(e.request, fr.clone()); } catch (x) {} })());
        return hit;
      }
      try { const fr = await fetch(e.request);
        if (fr.ok) (await caches.open(SHELL)).put(e.request, fr.clone());
        return fr;
      } catch (x) { return new Response("offline", { status: 503 }); }
    })());
    return;
  }
  if (url.origin !== location.origin) return;      // other cross-origin (big pack downloads): straight through
  if (e.request.method !== "GET") return;

  // Big stable assets: cache-first, refresh in the background.
  if (isAsset(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit) {
        e.waitUntil((async () => {
          try { const fresh = await fetch(e.request);
                if (fresh.ok) (await caches.open(SHELL)).put(e.request, fresh.clone()); } catch (err) {}
        })());
        return hit;
      }
      try {
        const fresh = await fetch(e.request);
        if (fresh.ok) (await caches.open(SHELL)).put(e.request, fresh.clone());
        return fresh;
      } catch (err) { return new Response("offline", { status: 503 }); }
    })());
    return;
  }

  // App code + navigations: network-first, fall back to cache offline.
  e.respondWith((async () => {
    try {
      // bust the CDN edge cache with the shell version so a deploy is never served stale,
      // but cache/serve under the ORIGINAL url so offline still works.
      let reqUrl = e.request.url;
      try { const u = new URL(reqUrl); u.searchParams.set("_v", SHELL); reqUrl = u.toString(); } catch (x) {}
      const fresh = await fetch(reqUrl, { cache: "no-store" });
      if (fresh.ok) (await caches.open(SHELL)).put(e.request, fresh.clone());
      return fresh;
    } catch (err) {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      if (e.request.mode === "navigate") {
        const idx = await caches.match("index.html");
        if (idx) return idx;
      }
      return new Response("offline", { status: 503 });
    }
  })());
});
