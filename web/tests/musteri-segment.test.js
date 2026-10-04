const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
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

async function satisYap(musteriId, gunOnce) {
  const s = (await kasiyer.post('/api/satislar', { musteri_id: musteriId, kalemler: [{ ilac_id: 1, adet: 1 }] })).data;
  db.prepare("UPDATE satislar SET tarih = datetime('now', ?) WHERE id = ?").run(`-${gunOnce} days`, s.id);
}

test('müşteri segmentleri: sadık, yeni, kaybedilmek üzere, kayıp, hiç', async () => {
  const yap = async (ad) => (await admin.post('/api/musteriler', { ad_soyad: ad })).data.id;
  const sadik = await yap('Sadık Müşteri');
  for (const g of [100, 60, 30, 5]) await satisYap(sadik, g);
  const yeni = await yap('Yeni Müşteri');
  await satisYap(yeni, 3);
  const risk = await yap('Riskli Müşteri');
  await satisYap(risk, 200);
  await satisYap(risk, 70);
  const kayip = await yap('Kayıp Müşteri');
  await satisYap(kayip, 300);
  const hic = await yap('Hiç Gelmeyen');

  const r = (await kasiyer.get('/api/musteriler/segmentler')).data;
  const seg = Object.fromEntries(r.musteriler.map((m) => [m.id, m.segment]));
  assert.deepEqual([seg[sadik], seg[yeni], seg[risk], seg[kayip], seg[hic]], ['sadik', 'yeni', 'risk', 'kayip', 'hic']);
  assert.ok(r.ozet.sadik.sayi >= 1);
  assert.equal(r.ozet.kayip.ad, 'Kayıp');
});

test('doğum günü listesi yıl geçişini hesaba katar; kutlama mesajı ileti izni ister', async () => {
  const bugun = new Date();
  const iki = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() + 2);
  const p = (n) => String(n).padStart(2, '0');
  const izinli = (await admin.post('/api/musteriler', { ad_soyad: 'Doğum Günlü', telefon: '05551234567', ileti_izni: true, dogum_tarihi: `1990-${p(bugun.getMonth() + 1)}-${p(bugun.getDate())}` })).data;
  const izinsiz = (await admin.post('/api/musteriler', { ad_soyad: 'İzinsiz Kişi', telefon: '05550000001', dogum_tarihi: `1985-${p(iki.getMonth() + 1)}-${p(iki.getDate())}` })).data;
  const liste = (await kasiyer.get('/api/musteriler/dogum-gunleri?gun=7')).data;
  const a = liste.find((m) => m.id === izinli.id);
  const b = liste.find((m) => m.id === izinsiz.id);
  assert.equal(a.kalan_gun, 0);
  assert.equal(a.yeni_yas, bugun.getFullYear() - 1990);
  assert.equal(b.kalan_gun, 2);
  assert.ok(!(await kasiyer.get('/api/musteriler/dogum-gunleri?gun=0')).data.some((m) => m.id === izinsiz.id));

  assert.equal((await kasiyer.post(`/api/musteriler/${izinsiz.id}/dogum-gunu-mesaji`, {})).status, 409);
  const msj = (await kasiyer.post(`/api/musteriler/${izinli.id}/dogum-gunu-mesaji`, {})).data;
  assert.match(msj.mesaj, /Sevgili Doğum/);
  const zil = (await kasiyer.get('/api/bildirim-merkezi')).data;
  assert.ok((zil.ogeler || zil).some((o) => o.kod === 'dogum_gunu'));
});

test('müşteri araması Türkçe büyük/küçük harfe duyarsız; hızlı tuş ürünleri', async () => {
  await admin.post('/api/musteriler', { ad_soyad: 'Şükrü Işık' });
  assert.ok((await kasiyer.get('/api/musteriler?q=' + encodeURIComponent('ŞÜKRÜ ışık'))).data.some((m) => m.ad_soyad === 'Şükrü Işık'));
  const hizli = (await kasiyer.get('/api/ilaclar?hizli=1')).data;
  assert.ok(hizli.length >= 5);
  assert.ok(hizli.every((i) => i.hizli_tus === 1));
});
