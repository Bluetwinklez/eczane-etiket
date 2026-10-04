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

const gunSonra = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('SKT yaklaşan reçetesiz ürünlere indirim önerisi; kampanya açılınca listeden düşer', async () => {
  const krem = (await admin.post('/api/ilaclar', { ad: 'Miadı Yakın Krem', satis_fiyati: 80, stok: 4, skt: gunSonra(10) })).data;
  const vit = (await admin.post('/api/ilaclar', { ad: 'Miadı Orta Vitamin', satis_fiyati: 50, stok: 3, skt: gunSonra(45) })).data;
  await admin.post('/api/ilaclar', { ad: 'Reçeteli Yakın', satis_fiyati: 50, stok: 3, skt: gunSonra(5), receteli: true });
  assert.equal((await kasiyer.get('/api/kampanyalar/skt-onerileri')).status, 403);
  const liste = (await admin.get('/api/kampanyalar/skt-onerileri')).data;
  const k = liste.find((o) => o.ilac_id === krem.id);
  const v = liste.find((o) => o.ilac_id === vit.id);
  assert.equal(k.onerilen_yuzde, 30);
  assert.equal(v.onerilen_yuzde, 10);
  assert.ok(!liste.some((o) => o.ad === 'Reçeteli Yakın'));

  await admin.post('/api/kampanyalar', { ad: 'SKT', tip: 'yuzde', indirim_yuzdesi: 30, hedef_tip: 'urun', hedef_deger: krem.id, bitis: k.skt });
  assert.ok(!(await admin.get('/api/kampanyalar/skt-onerileri')).data.some((o) => o.ilac_id === krem.id));
});

test('stok yaşlandırma raporu bekleme süresine göre dilimler', async () => {
  const eski = (await admin.post('/api/ilaclar', { ad: 'Eski Stok Şurup', satis_fiyati: 40, alis_fiyati: 20, stok: 5 })).data;
  db.prepare("UPDATE ilac_partileri SET giris_tarihi = datetime('now', '-200 days') WHERE ilac_id = ?").run(eski.id);
  const rows = (await admin.get('/api/raporlar/stok-yaslandirma')).data;
  const r = rows.find((x) => x.ad === 'Eski Stok Şurup');
  assert.equal(r.dilim, '180+ gün');
  assert.equal(r.maliyet, 100);
  assert.ok(rows[0].bekleme_gun >= rows[rows.length - 1].bekleme_gun);
});

test('sipariş formu PDF olarak indirilir', async () => {
  const s = (await admin.post('/api/siparisler', { tedarikci_id: 1, kalemler: [{ ilac_id: 1, istenen_adet: 12, tahmini_birim_fiyat: 15 }] })).data;
  const res = await fetch(`${sunucu.base}/api/siparisler/${s.id}/form`, { headers: { Cookie: admin.cerez() } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal((await admin.get('/api/siparisler/99999/form')).status, 404);
});
