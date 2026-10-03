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

test('urun tipi verilmezse ilac olarak kaydedilir, gecersiz tip reddedilir', async () => {
  const varsayilan = await admin.post('/api/ilaclar', { ad: 'Tip Test A', satis_fiyati: 10 });
  assert.equal(varsayilan.status, 201);
  assert.equal(varsayilan.data.urun_tipi, 'ilac');

  const gecersiz = await admin.post('/api/ilaclar', { ad: 'Tip Test B', satis_fiyati: 10, urun_tipi: 'uzay' });
  assert.equal(gecersiz.status, 400);
});

test('duzenlemede tip gonderilmezse mevcut tip korunur', async () => {
  const krem = await admin.post('/api/ilaclar', { ad: 'Tip Test Krem', satis_fiyati: 50, urun_tipi: 'dermokozmetik' });
  assert.equal(krem.status, 201);
  const guncel = await admin.put(`/api/ilaclar/${krem.data.id}`, { ad: 'Tip Test Krem 2', satis_fiyati: 55 });
  assert.equal(guncel.status, 200);
  assert.equal(guncel.data.urun_tipi, 'dermokozmetik');

  const tipDegisti = await admin.put(`/api/ilaclar/${krem.data.id}`, { ad: 'Tip Test Krem 2', satis_fiyati: 55, urun_tipi: 'medikal' });
  assert.equal(tipDegisti.data.urun_tipi, 'medikal');
});

test('liste urun tipine gore filtrelenebilir', async () => {
  const takviyeler = (await admin.get('/api/ilaclar?urun_tipi=takviye')).data;
  assert.ok(takviyeler.length > 0, 'seed takviye urunleri olmali');
  assert.ok(takviyeler.every((u) => u.urun_tipi === 'takviye'));
});

test('urun tipi raporu tiplere gore ciroyu ve paylari verir', async () => {
  const takviye = (await admin.get('/api/ilaclar?urun_tipi=takviye')).data.find((u) => u.stok > 0);
  const satis = await admin.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 1 }, { ilac_id: takviye.id, adet: 1 }] });
  assert.equal(satis.status, 201);

  const rapor = (await admin.get('/api/raporlar/urun-tipi')).data;
  const tipler = rapor.map((r) => r.urun_tipi);
  assert.ok(tipler.includes('ilac'));
  assert.ok(tipler.includes('takviye'));
  assert.equal(rapor.find((r) => r.urun_tipi === 'takviye').urun_tipi_adi, 'Gıda Takviyesi');
  const toplamPay = rapor.reduce((t, r) => t + r.ciro_payi, 0);
  assert.ok(Math.abs(toplamPay - 100) < 0.5);
});
