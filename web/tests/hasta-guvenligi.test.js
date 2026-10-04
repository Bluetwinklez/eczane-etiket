const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');
const { yasHesapla } = require('../server/etkilesim');

let sunucu;
let admin;
let kasiyer;
const ilacId = (ad) => db.prepare('SELECT id FROM ilaclar WHERE ad = ?').get(ad).id;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('yaş hesabı doğum günü geçmeden bir eksik sayar', () => {
  assert.equal(yasHesapla('2000-06-15', new Date('2026-06-14T12:00:00')), 25);
  assert.equal(yasHesapla('2000-06-15', new Date('2026-06-15T12:00:00')), 26);
  assert.equal(yasHesapla(null), null);
});

test('gebe müşteriye kontrendike ilaç ve yaş sınırı uyarısı verilir', async () => {
  const gebe = (await admin.post('/api/musteriler', { ad_soyad: 'Zeynep Gebe', gebelik_durumu: 'gebe', dogum_tarihi: '1995-03-10' })).data;
  assert.equal(gebe.gebelik_durumu, 'gebe');
  const r = (await kasiyer.post('/api/etkilesimler/kontrol', { musteri_id: gebe.id, ilac_ids: [ilacId('Xanax 0.5mg 30 Tablet'), ilacId('Talcid 500mg 20 Tablet')] })).data;
  assert.equal(r.hasta.length, 1);
  assert.equal(r.hasta[0].tur, 'gebelik');
  assert.equal(r.hasta[0].seviye, 'ciddi');

  const cocukYil = new Date().getFullYear() - 10;
  const cocuk = (await admin.post('/api/musteriler', { ad_soyad: 'Can Çocuk', dogum_tarihi: `${cocukYil}-01-01` })).data;
  const r2 = (await kasiyer.post('/api/etkilesimler/kontrol', { musteri_id: cocuk.id, ilac_ids: [ilacId('Aspirin 100mg 30 Tablet')] })).data;
  assert.equal(r2.hasta[0].tur, 'yas');

  const yasli = (await admin.post('/api/musteriler', { ad_soyad: 'Hasan Amca', dogum_tarihi: '1950-05-05' })).data;
  const r3 = (await kasiyer.post('/api/etkilesimler/kontrol', { musteri_id: yasli.id, ilac_ids: [ilacId('Nurofen 400mg 24 Tablet')] })).data;
  assert.deepEqual(r3.hasta.map((h) => h.tur), ['yasli']);
});

test('müşteri hasta alanları doğrulanır ve kısmi güncellemede korunur', async () => {
  assert.equal((await admin.post('/api/musteriler', { ad_soyad: 'X', gebelik_durumu: 'belki' })).status, 400);
  assert.equal((await admin.post('/api/musteriler', { ad_soyad: 'X', dogum_tarihi: '2999-01-01' })).status, 400);
  const m = (await admin.post('/api/musteriler', { ad_soyad: 'Elif', dogum_tarihi: '1990-01-01', gebelik_durumu: 'emziren' })).data;
  const g = (await admin.put('/api/musteriler/' + m.id, { ad_soyad: 'Elif K.' })).data;
  assert.equal(g.dogum_tarihi, '1990-01-01');
  assert.equal(g.gebelik_durumu, 'emziren');
});

test('ilaç raf konumu ve uyarı alanları kaydedilir; aramada raf ile bulunur', async () => {
  const id = ilacId('Parol 500mg 20 Tablet');
  const mevcut = (await admin.get('/api/ilaclar')).data.find((i) => i.id === id);
  assert.equal((await admin.put('/api/ilaclar/' + id, { ...mevcut, min_yas: 150 })).status, 400);
  const g = (await admin.put('/api/ilaclar/' + id, { ...mevcut, raf_konumu: 'Z9', gebelik_uyari: 'dikkat', yasli_uyari: true })).data;
  assert.equal(g.raf_konumu, 'Z9');
  assert.equal(g.yasli_uyari, 1);
  const bulunan = (await kasiyer.get('/api/ilaclar?q=z9')).data;
  assert.deepEqual(bulunan.map((i) => i.id), [id]);
});

test('Türkçe büyük/küçük harfle arama ve muadil listesi', async () => {
  const yeni = (await admin.post('/api/ilaclar', { ad: 'İbufen 400mg', satis_fiyati: 30, etken_madde: 'ibuprofen', stok: 5 })).data;
  assert.ok((await kasiyer.get('/api/ilaclar?q=ibufen')).data.some((i) => i.id === yeni.id));
  const muadil = (await kasiyer.get(`/api/ilaclar/${ilacId('Nurofen 400mg 24 Tablet')}/muadiller`)).data;
  assert.ok(muadil.some((m) => m.id === yeni.id));
  assert.ok(muadil.every((m) => m.etken_madde === 'ibuprofen'));
  assert.equal((await kasiyer.get('/api/ilaclar/999999/muadiller')).status, 404);
});
