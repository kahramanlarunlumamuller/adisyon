// Uygulamayı güncellediğinizde bu numarayı artırın (v1 -> v2) ki telefonlar yeni sürümü alsın.
const CACHE = 'adisyon-v8';

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'firebase-config.js',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' -> tarayıcının eski kopyasını değil, sunucudaki güncel dosyayı al
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Kendi dosyalarımız: her açılışta sunucudan güncel mi diye sor (no-cache), internet yoksa önbellekten aç
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  // Firebase SDK ve Excel kütüphanesi: önbellekten, yoksa internetten
  if (url.hostname === 'www.gstatic.com' || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
  // Diğer istekler (Firebase veritabanı, giriş) doğrudan geçer.
});
