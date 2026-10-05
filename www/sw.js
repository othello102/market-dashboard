// 항상 네트워크 우선(최신 파일), 오프라인이면 마지막으로 받은 캐시 사용
const CACHE = "mkt-cache";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(clients.claim()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
