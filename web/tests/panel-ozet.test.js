const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');

let sunucu;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('panel ozeti: 14 gunluk seri, kategori dagilimi ve son satislar', async () => {
  const bos = (await kasiyer.get('/api/satislar/panel-ozet')).data;
  assert.equal(bos.gunluk.length, 14);
  assert.ok(bos.gunluk.every((g) => g.toplam === 0 && g.adet === 0));
  assert.deepEqual(bos.son_satislar, []);

  const s1 = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 2 }] })).data;
  const s2 = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 1 }, { ilac_id: 2, adet: 1 }] })).data;
  // Ikinci satisi 40 gun once yap: onceki_30 sutununa dusmeli; 70 gun onceki satis hic sayilmamali
  db.prepare("UPDATE satislar SET tarih = datetime('now', '-40 days') WHERE id = ?").run(s2.id);
  const s3 = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 5 }] })).data;
  db.prepare("UPDATE satislar SET tarih = datetime('now', '-70 days') WHERE id = ?").run(s3.id);

  const r = (await kasiyer.get('/api/satislar/panel-ozet')).data;
  const bugun = r.gunluk[r.gunluk.length - 1];
  assert.equal(bugun.adet, 1);
  assert.equal(bugun.toplam, s1.toplam_tutar);
  assert.equal(r.son_satislar[0].id, s1.id);
  assert.equal(r.son_satislar.length, 3);
  assert.equal(r.son_satislar[0].kalem_sayisi, 1);
  assert.ok(r.son_satislar[0].ilk_urun);

  const kategori1 = db.prepare('SELECT kategori FROM ilaclar WHERE id = 1').get().kategori;
  const k = r.kategoriler.find((x) => x.kategori === kategori1);
  const kategoriBul = db.prepare('SELECT kategori FROM ilaclar WHERE id = ?');
  const beklenenOnceki = s2.kalemler
    .filter((x) => kategoriBul.get(x.ilac_id).kategori === kategori1)
    .reduce((t, x) => t + x.ara_toplam, 0);
  assert.equal(k.son_30, s1.toplam_tutar);
  assert.equal(k.onceki_30, Math.round(beklenenOnceki * 100) / 100);
  assert.ok(r.kategoriler.length <= 6);
});
