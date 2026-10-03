const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

async function stokOku(ilacId) {
  return (await admin.get(`/api/ilaclar/${ilacId}`)).data.stok;
}

test('stok girisi ve cikisi stogu dogru gunceller', async () => {
  const once = await stokOku(1);
  assert.equal((await admin.post('/api/ilaclar/1/stok', { tip: 'giris', adet: 10 })).status, 200);
  assert.equal(await stokOku(1), once + 10);
  assert.equal((await admin.post('/api/ilaclar/1/stok', { tip: 'cikis', adet: 4 })).status, 200);
  assert.equal(await stokOku(1), once + 6);
});

test('stoktan fazla cikis reddedilir', async () => {
  const res = await admin.post('/api/ilaclar/1/stok', { tip: 'cikis', adet: 999999 });
  assert.equal(res.status, 400);
});

test('kasiyer stok hareketi yapamaz ama listeyi gorur', async () => {
  assert.equal((await kasiyer.post('/api/ilaclar/1/stok', { tip: 'giris', adet: 1 })).status, 403);
  assert.equal((await kasiyer.get('/api/ilaclar')).status, 200);
});

test('fiyat degisikligi fiyat gecmisine kaydedilir', async () => {
  const ilac = (await admin.get('/api/ilaclar/2')).data;
  await admin.put('/api/ilaclar/2', { ...ilac, satis_fiyati: ilac.satis_fiyati + 5 });
  const gecmis = (await admin.get('/api/ilaclar/2/fiyat-gecmisi')).data;
  assert.equal(gecmis.length, 1);
  assert.equal(gecmis[0].eski_fiyat, ilac.satis_fiyati);
  assert.equal(gecmis[0].yeni_fiyat, ilac.satis_fiyati + 5);
});

test('satis stogu duser ve toplam tutari dogru hesaplar', async () => {
  const ilac = (await admin.get('/api/ilaclar/4')).data;
  const res = await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 4, adet: 3 }] });
  assert.equal(res.status, 201);
  assert.equal(res.data.toplam_tutar, ilac.satis_fiyati * 3);
  assert.equal(await stokOku(4), ilac.stok - 3);
});

test('yuzdelik indirim ara toplamdan dusulur', async () => {
  const ilac = (await admin.get('/api/ilaclar/6')).data;
  const res = await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 6, adet: 2 }], indirim_yuzdesi: 10 });
  assert.equal(res.status, 201);
  const araToplam = ilac.satis_fiyati * 2;
  assert.equal(res.data.ara_toplam, araToplam);
  assert.ok(Math.abs(res.data.toplam_tutar - araToplam * 0.9) < 0.01);
});

test('yetersiz stokta satis reddedilir ve stok degismez', async () => {
  const once = await stokOku(8);
  const res = await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 8, adet: once + 1 }] });
  assert.equal(res.status, 400);
  assert.equal(await stokOku(8), once);
});

test('bos sepetle satis reddedilir', async () => {
  assert.equal((await kasiyer.post('/api/satislar', { kalemler: [] })).status, 400);
});
