// Eczam Mobil servis calisani: uygulama kabugu onbelleklenir (cevrimdisi acilir),
// bazi GET API cagrilari agdan once denenir, ag yoksa onbellekten doner.
const SURUM = 'eczanem-mobil-v4';
const KABUK = [
  '/mobil/', '/mobil/index.html', '/mobil/mobil.css', '/mobil/mobil.js', '/mobil/mobil-islemler.js', '/mobil/mobil-dil.js', '/mobil/vendor/zxing.min.js',
  '/mobil/manifest.webmanifest', '/mobil/ikonlar/ikon-192.png', '/mobil/ikonlar/ikon-512.png',
  '/img/logo-isaret.svg', '/favicon.svg',
  '/fonts/bricolage-grotesque-latin.woff2', '/fonts/bricolage-grotesque-latin-ext.woff2',
  '/fonts/manrope-latin.woff2', '/fonts/manrope-latin-ext.woff2', '/gizlilik.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((adlar) => Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const istek = e.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== location.origin) return;
  // API: her zaman agdan (oturum/guncel veri); onbellekleme uygulama kodunda (localStorage)
  if (url.pathname.startsWith('/api/')) return;
  // Uygulama kabugu: once agdan dene (yeni surum gelsin), olmazsa onbellek
  e.respondWith(
    fetch(istek)
      .then((cevap) => {
        if (cevap.ok && (url.pathname.startsWith('/mobil/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/img/'))) {
          const kopya = cevap.clone();
          caches.open(SURUM).then((c) => c.put(istek, kopya));
        }
        return cevap;
      })
      .catch(() => caches.match(istek, { ignoreSearch: true }).then((c) => c || (istek.mode === 'navigate' ? caches.match('/mobil/index.html') : Response.error())))
  );
});
