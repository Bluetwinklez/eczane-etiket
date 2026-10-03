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

test('yogunluk haritasi: yerel saate (UTC+3) gore gun x saat', async () => {
  const s = (await admin.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 1 }] })).data;
  // 2026-09-28 Pazartesi 07:30 UTC = 10:30 Turkiye
  db.prepare("UPDATE satislar SET tarih = '2026-09-28 07:30:00' WHERE id = ?").run(s.id);
  const r = (await admin.get('/api/raporlar/yogunluk?gun=365')).data;
  assert.equal(r.matris.length, 7);
  assert.equal(r.matris[0].length, 24);
  assert.equal(r.matris[0][10].adet, 1, 'Pazartesi 10:00');
  assert.equal(r.matris[0][10].ciro, 24.9);
  assert.deepEqual(r.en_yogun, { gun: 0, saat: 10, adet: 1 });
  assert.equal((await kasiyer.get('/api/raporlar/yogunluk')).status, 403);
});

test('aylik hedef: gerceklesen satis - iade, yuzde ve gunluk gereken', async () => {
  const bos = (await kasiyer.get('/api/hedefler/aktif')).data;
  assert.equal(bos.hedef, null);

  assert.equal((await kasiyer.put('/api/hedefler', { ay: bos.ay, hedef_tutar: 1000 })).status, 403);
  assert.equal((await admin.put('/api/hedefler', { ay: '2026-13', hedef_tutar: 1000 })).status, 400);
  const h = (await admin.put('/api/hedefler', { ay: bos.ay, hedef_tutar: 1000 })).data;
  assert.equal(h.hedef, 1000);

  const s = (await admin.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 4 }] })).data; // 99.60
  await admin.post('/api/iadeler', { satis_id: s.id, kalemler: [{ satis_kalem_id: s.kalemler[0].id, adet: 1 }] }); // -24.90
  const a = (await kasiyer.get('/api/hedefler/aktif')).data;
  assert.ok(Math.abs(a.gerceklesen - 74.7) < 0.001, 'bu ayki net ciro');
  assert.equal(a.yuzde, 7.5);
  assert.ok(a.kalan_gun >= 1);
  assert.ok(Math.abs(a.gunluk_gereken - Math.round(((1000 - 74.7) / a.kalan_gun) * 100) / 100) < 0.011);

  const gecmis = (await kasiyer.get('/api/hedefler')).data;
  assert.equal(gecmis.length, 12);
  assert.equal(gecmis[0].ay, a.ay);

  const sil = (await admin.put('/api/hedefler', { ay: bos.ay, hedef_tutar: null })).data;
  assert.equal(sil.hedef, null);
});
