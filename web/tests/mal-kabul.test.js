const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
});
after(() => sunucu.kapat());

test('mal kabul: MF ile stok, parti, birim maliyet ve alis fiyati guncellenir', async () => {
  const ilac = (await admin.post('/api/ilaclar', { ad: 'MK Test', satis_fiyati: 50, alis_fiyati: 30 })).data;
  const r = await admin.post('/api/mal-kabul', {
    tedarikci_id: 1,
    fatura_no: 'F-1001',
    fatura_tarihi: '2026-10-01',
    kalemler: [{ ilac_id: ilac.id, adet: 10, mf: 2, alis_fiyati: 24, parti_no: 'MK1', skt: '2029-05-01' }]
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.toplam_tutar, 240);
  assert.equal(r.data.kalemler[0].birim_maliyet, 20, '24*10/12');

  const sonra = (await admin.get(`/api/ilaclar/${ilac.id}`)).data;
  assert.equal(sonra.stok, 12);
  assert.equal(sonra.alis_fiyati, 20);
  const partiler = (await admin.get(`/api/ilaclar/${ilac.id}/partiler`)).data;
  assert.deepEqual(partiler.map((p) => [p.parti_no, p.skt, p.miktar]), [['MK1', '2029-05-01', 12]]);
});

test('alis fiyati guncelleme kapatilabilir; dogrulamalar', async () => {
  const once = (await admin.get('/api/ilaclar/1')).data.alis_fiyati;
  await admin.post('/api/mal-kabul', { alis_fiyati_guncelle: false, kalemler: [{ ilac_id: 1, adet: 1, alis_fiyati: 99 }] });
  assert.equal((await admin.get('/api/ilaclar/1')).data.alis_fiyati, once);

  assert.equal((await admin.post('/api/mal-kabul', { kalemler: [] })).status, 400);
  assert.equal((await admin.post('/api/mal-kabul', { kalemler: [{ ilac_id: 1, adet: 0, alis_fiyati: 1 }] })).status, 400);
  assert.equal((await admin.post('/api/mal-kabul', { kalemler: [{ ilac_id: 1, adet: 1, mf: -1, alis_fiyati: 1 }] })).status, 400);
  assert.equal((await admin.post('/api/mal-kabul', { kalemler: [{ ilac_id: 1, adet: 1, alis_fiyati: 1, skt: '01.01.2030' }] })).status, 400);
});

test('siparisten mal kabul siparisi kapatir ve stok bir kez eklenir', async () => {
  const s = (await admin.post('/api/siparisler', { tedarikci_id: 2, kalemler: [{ ilac_id: 3, istenen_adet: 5 }] })).data;
  const once = (await admin.get('/api/ilaclar/3')).data.stok;
  const r = await admin.post('/api/mal-kabul', { siparis_id: s.id, kalemler: [{ ilac_id: 3, adet: 5, alis_fiyati: 60 }] });
  assert.equal(r.data.tedarikci_id, 2, 'tedarikci siparisten alinir');
  assert.equal((await admin.get(`/api/siparisler/${s.id}`)).data.durum, 'teslim_alindi');
  assert.equal((await admin.get('/api/ilaclar/3')).data.stok, once + 5);
  assert.equal((await admin.post('/api/mal-kabul', { siparis_id: s.id, kalemler: [{ ilac_id: 3, adet: 1, alis_fiyati: 60 }] })).status, 400);
});
