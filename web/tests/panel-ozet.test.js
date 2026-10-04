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
  // Ikinci satisi gecen aya tasi: kategori karsilastirmasinda gecen_ay sutununa dusmeli
  const gecenAy = db.prepare("SELECT datetime('now', '+3 hours', 'start of month', '-10 days', '-3 hours') AS t").get().t;
  db.prepare('UPDATE satislar SET tarih = ? WHERE id = ?').run(gecenAy, s2.id);

  const r = (await kasiyer.get('/api/satislar/panel-ozet')).data;
  const bugun = r.gunluk[r.gunluk.length - 1];
  assert.equal(bugun.adet, 1);
  assert.equal(bugun.toplam, s1.toplam_tutar);
  assert.equal(r.son_satislar[0].id, s1.id);
  assert.equal(r.son_satislar[0].kalem_sayisi, 1);
  assert.ok(r.son_satislar[0].ilk_urun);

  const kategori1 = db.prepare('SELECT kategori FROM ilaclar WHERE id = 1').get().kategori;
  const k = r.kategoriler.find((x) => x.kategori === kategori1);
  assert.equal(k.bu_ay, s1.toplam_tutar);
  assert.ok(k.gecen_ay > 0);
  assert.ok(r.kategoriler.length <= 6);
});
