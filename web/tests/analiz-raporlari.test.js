const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');

let sunucu;
let admin;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
});
after(() => sunucu.kapat());

test('olu stok: yakin zamanda satilan urun listelenmez, eski satilan ve hic satilmayan listelenir', async () => {
  const eski = (await admin.post('/api/ilaclar', { ad: 'Eski Satis', satis_fiyati: 10, alis_fiyati: 4, stok: 10 })).data;
  const s = (await admin.post('/api/satislar', { kalemler: [{ ilac_id: eski.id, adet: 1 }, { ilac_id: 1, adet: 1 }] })).data;
  // Satisi 120 gun oncesine tasi; Parol'u bugun tekrar sat
  db.prepare("UPDATE satislar SET tarih = datetime('now', '-120 days') WHERE id = ?").run(s.id);
  await admin.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 1 }] });

  const rows = (await admin.get('/api/raporlar/olu-stok?gun=90')).data;
  const e = rows.find((r) => r.id === eski.id);
  assert.ok(e);
  assert.equal(e.bagli_sermaye, 36, '9 stok x 4 alis');
  assert.ok(!rows.some((r) => r.id === 1), 'bugun satilan Parol olu stok degil');
  assert.ok(rows.some((r) => r.son_satis === 'Hic satilmadi'));
  assert.ok(rows[0].bagli_sermaye >= rows[rows.length - 1].bagli_sermaye, 'sermayeye gore azalan');
});

test('ABC: siniflar kumulatif paya gore, paylar toplami 100', async () => {
  await admin.post('/api/satislar', { kalemler: [{ ilac_id: 5, adet: 10 }, { ilac_id: 2, adet: 2 }, { ilac_id: 9, adet: 1 }] });
  const rows = (await admin.get('/api/raporlar/abc')).data;
  assert.ok(rows.length >= 3);
  assert.equal(rows[0].sinif, 'A');
  assert.ok(Math.abs(rows.reduce((t, r) => t + r.pay, 0) - 100) < 0.5);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].ciro >= rows[i].ciro);
  assert.equal(rows[rows.length - 1].sinif, 'C');
});

test('tedarikci fiyat karsilastirma en ucuzu isaretler ve farki hesaplar', async () => {
  await admin.post('/api/mal-kabul', { tedarikci_id: 1, kalemler: [{ ilac_id: 4, adet: 10, alis_fiyati: 30 }] });
  await admin.post('/api/mal-kabul', { tedarikci_id: 2, kalemler: [{ ilac_id: 4, adet: 10, mf: 2, alis_fiyati: 30 }] });
  const rows = (await admin.get('/api/raporlar/tedarikci-fiyat')).data.filter((r) => r.ilac_id === 4);
  assert.equal(rows.length, 2);
  const ucuz = rows.find((r) => r.en_ucuz === 'Evet');
  assert.equal(ucuz.tedarikci_id, 2, 'MF sayesinde birim maliyet 25');
  assert.equal(ucuz.son_maliyet, 25);
  assert.equal(rows.find((r) => r.tedarikci_id === 1).fark_yuzde, 20);
});

test('yeni raporlar CSV olarak da iner', async () => {
  for (const r of ['olu-stok', 'abc', 'tedarikci-fiyat']) {
    const res = await admin.get(`/api/raporlar/${r}?format=csv`);
    assert.equal(res.status, 200, r);
    assert.match(res.headers.get('content-type'), /text\/csv/);
  }
});
