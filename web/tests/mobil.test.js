const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');

let sunucu;
let admin;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('mobil özet: oturum ister, dönem kıyası ve serileri verir', async () => {
  const anonim = await fetch(sunucu.base + '/api/mobil/ozet');
  assert.equal(anonim.status, 401);

  const bos = (await kasiyer.get('/api/mobil/ozet?donem=gun')).data;
  assert.equal(bos.toplam, 0);
  assert.equal(bos.seri.length, 7);

  // ilac 1 recetesiz (24,90), receteli bir urun de sat
  const receteli = db.prepare('SELECT id FROM ilaclar WHERE receteli = 0 AND recete_turu IS NULL LIMIT 1').get();
  const s = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: receteli.id, adet: 2 }] })).data;
  const dun = db.prepare('SELECT id FROM ilaclar WHERE receteli = 0 LIMIT 1').get();
  const eski = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: dun.id, adet: 1 }] })).data;
  db.prepare("UPDATE satislar SET tarih = datetime('now', '-1 day') WHERE id = ?").run(eski.id);

  const g = (await kasiyer.get('/api/mobil/ozet?donem=gun')).data;
  assert.equal(g.adet, 1);
  assert.equal(g.toplam, s.toplam_tutar);
  assert.equal(g.recetesiz, s.toplam_tutar);
  assert.equal(g.receteli, 0);
  assert.equal(g.onceki.toplam, eski.toplam_tutar);
  assert.equal(g.seri[g.seri.length - 1].toplam, s.toplam_tutar);
  assert.equal(g.seri[g.seri.length - 2].toplam, eski.toplam_tutar);

  const h = (await kasiyer.get('/api/mobil/ozet?donem=hafta')).data;
  assert.equal(h.seri.length, 8);
  assert.ok(h.toplam >= g.toplam);
  const a = (await kasiyer.get('/api/mobil/ozet?donem=ay')).data;
  assert.equal(a.seri.length, 6);
  assert.equal((await kasiyer.get('/api/mobil/ozet?donem=yil')).data.donem, 'gun', 'geçersiz dönem güne döner');
  assert.ok(typeof g.kritik_stok === 'number' && typeof g.skt_yakin === 'number');
});

test('mobil özet: yönetici tüm şubeleri, kasiyer yalnız kendi şubesini görür', async () => {
  assert.equal((await admin.get('/api/mobil/ozet')).data.subeler.length, 2);
  const k = (await kasiyer.get('/api/mobil/ozet')).data.subeler;
  assert.equal(k.length, 1);
  assert.equal(k[0].id, 1);
});

test('PWA dosyaları: manifest, simgeler, servis çalışanı ve yerel okuyucu mevcut', async () => {
  const m = (await fetch(sunucu.base + '/mobil/manifest.webmanifest').then((r) => r.json()));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/mobil/');
  for (const ikon of m.icons) {
    const r = await fetch(sunucu.base + '/mobil/' + ikon.src);
    assert.equal(r.status, 200, ikon.src);
    assert.equal(r.headers.get('content-type'), 'image/png');
  }
  for (const yol of ['/mobil/', '/mobil/sw.js', '/mobil/mobil.js', '/mobil/mobil.css', '/mobil/vendor/zxing.min.js']) {
    assert.equal((await fetch(sunucu.base + yol)).status, 200, yol);
  }
  // Harici adres yok: cevrimdisi ilkesi
  const html = await fetch(sunucu.base + '/mobil/').then((r) => r.text());
  assert.ok(!/https?:\/\/(?!localhost)/.test(html.replace(/<noscript>[\s\S]*?<\/noscript>/, '')), 'index.html harici adres içermemeli');
  const sw = await fetch(sunucu.base + '/mobil/sw.js').then((r) => r.text());
  const kabuk = sw.match(/const KABUK = \[([\s\S]*?)\];/)[1];
  for (const dosya of [...kabuk.matchAll(/'(\/[^']+)'/g)].map((x) => x[1])) {
    assert.equal((await fetch(sunucu.base + dosya)).status, 200, 'sw önbellek listesinde olmayan dosya: ' + dosya);
  }
});

test('App Store simgesi 1024x1024 ve şeffaflık (alfa) içermez', () => {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobil', 'ikonlar', 'appstore-1024.png'));
  assert.equal(buf.readUInt32BE(16), 1024);
  assert.equal(buf.readUInt32BE(20), 1024);
  assert.equal(buf[25], 2, 'PNG renk tipi 2 (RGB), alfa kanalı yok');
});

test('gizlilik politikası: kamera ve veri sorumlusu bilgisi var, iletişim yapılandırılabilir', async () => {
  let r = await fetch(sunucu.base + '/gizlilik.html');
  let html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /Kamera/);
  assert.match(html, /veri sorumlusu/);
  assert.match(html, /eczane yöneticinize başvurun/);
  assert.ok(!html.includes('{{'), 'doldurulmamış yer tutucu kalmamalı');
  assert.equal((await fetch(sunucu.base + '/gizlilik.template.html')).status, 404);

  process.env.ECZANEM_GIZLILIK_EPOSTA = 'gizlilik@ornek-eczane.com';
  html = await (await fetch(sunucu.base + '/gizlilik.html')).text();
  assert.match(html, /mailto:gizlilik@ornek-eczane\.com/);
  process.env.ECZANEM_GIZLILIK_EPOSTA = '"><script>alert(1)</script>';
  html = await (await fetch(sunucu.base + '/gizlilik.html')).text();
  assert.ok(!html.includes('<script>alert'), 'geçersiz e-posta HTML enjekte edemez');
  delete process.env.ECZANEM_GIZLILIK_EPOSTA;
});

test('mobil işlem ekranları: eklenti dosyası mobil.js’ten önce yüklenir ve çevrimdışı önbelleğe girer', () => {
  const kok = path.join(__dirname, '..', 'public', 'mobil');
  const html = fs.readFileSync(path.join(kok, 'index.html'), 'utf8');
  assert.ok(html.indexOf('mobil-islemler.js') > -1 && html.indexOf('mobil-islemler.js') < html.indexOf('src="mobil.js"'));
  const sw = fs.readFileSync(path.join(kok, 'sw.js'), 'utf8');
  assert.match(sw.match(/const KABUK = \[([\s\S]*?)\];/)[1], /\/mobil\/mobil-islemler\.js/);
  const eklenti = fs.readFileSync(path.join(kok, 'mobil-islemler.js'), 'utf8');
  for (const ekran of ['oneri', "'hizli-satis'", 'musteriler', 'siparisler', "'mal-kabul'", 'gorevler', 'kasa', 'iade']) assert.ok(eklenti.includes(ekran), ekran);
  // Cekirdek hala ekranlari yonlendiriyor
  const cekirdek = fs.readFileSync(path.join(kok, 'mobil.js'), 'utf8');
  assert.match(cekirdek, /window\.EczamEklenti/);
  for (const yol of ['#/hizli-satis', '#/musteriler', '#/mal-kabul', '#/siparisler', '#/oneri', '#/gorevler', '#/kasa', '#/iade']) assert.ok(cekirdek.includes(yol), yol);
});
