// Caches only static media (background video, poster, icons) so they load offline.
const CACHE = "jumbo-media-v1";
const MEDIA = ["/videos/jumbo-bg.mp4", "/videos/jumbo-bg.jpg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(MEDIA)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !MEDIA.includes(url.pathname)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(url.pathname);
      if (hit) {
        const range = e.request.headers.get("range");
        if (!range) return hit;
        const buf = await hit.arrayBuffer();
        const [, s, en] = /bytes=(\d+)-(\d*)/.exec(range) || [];
        const start = Number(s || 0);
        const end = en ? Number(en) : buf.byteLength - 1;
        return new Response(buf.slice(start, end + 1), {
          status: 206,
          headers: {
            "Content-Type": hit.headers.get("Content-Type") || "video/mp4",
            "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
          },
        });
      }
      const res = await fetch(url.pathname);
      if (res.ok) cache.put(url.pathname, res.clone());
      return res;
    }),
  );
});
