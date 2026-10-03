const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let kasiyer;
let musteriId;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  const m = await kasiyer.post('/api/musteriler', { ad_soyad: 'Veresiye Test', veresiye_limiti: 100 });
  musteriId = m.data.id;
});
after(() => sunucu.kapat());

test('veresiye satis musteri gerektirir ve gecersiz odeme tipi reddedilir', async () => {
  const r1 = await kasiyer.post('/api/satislar', { odeme_tipi: 'veresiye', kalemler: [{ ilac_id: 1, adet: 1 }] });
  assert.equal(r1.status, 400);
  const r2 = await kasiyer.post('/api/satislar', { odeme_tipi: 'bitcoin', kalemler: [{ ilac_id: 1, adet: 1 }] });
  assert.equal(r2.status, 400);
});

test('veresiye satis borc yazar, limit asimi engellenir', async () => {
  const satis = await kasiyer.post('/api/satislar', { musteri_id: musteriId, odeme_tipi: 'veresiye', kalemler: [{ ilac_id: 1, adet: 2 }] });
  assert.equal(satis.status, 201);
  const borc = satis.data.toplam_tutar;
  assert.equal((await kasiyer.get(`/api/musteriler/${musteriId}`)).data.veresiye_bakiyesi, borc);

  // 100 TL limit: 2 x 24.90 = 49.80 borc var, 3 adet daha (74.70) limiti asar
  const asim = await kasiyer.post('/api/satislar', { musteri_id: musteriId, odeme_tipi: 'veresiye', kalemler: [{ ilac_id: 1, adet: 3 }] });
  assert.equal(asim.status, 400);
  assert.match(asim.data.error, /limit/i);
});

test('tahsilat borcu duser, borctan fazla tahsilat reddedilir, kasa ozetine yansir', async () => {
  const oncekiOzet = (await kasiyer.get('/api/kasa-kapanislari/ozet')).data;
  const bakiye = (await kasiyer.get(`/api/musteriler/${musteriId}`)).data.veresiye_bakiyesi;

  const fazla = await kasiyer.post(`/api/veresiye/${musteriId}/tahsilat`, { tutar: bakiye + 1 });
  assert.equal(fazla.status, 400);

  const t = await kasiyer.post(`/api/veresiye/${musteriId}/tahsilat`, { tutar: 20, odeme_tipi: 'nakit' });
  assert.equal(t.status, 201);
  assert.ok(Math.abs(t.data.bakiye - (bakiye - 20)) < 0.001);

  const ozet = (await kasiyer.get('/api/kasa-kapanislari/ozet')).data;
  assert.ok(Math.abs(ozet.nakit - oncekiOzet.nakit - 20) < 0.001, 'nakit tahsilat beklenen nakde eklenmeli');
  assert.ok(ozet.veresiye > 0);
  assert.equal(ozet.tahsilat_nakit, 20);
});

test('veresiye listesi ve hesap detayi yuruyen bakiyeyi verir', async () => {
  const liste = (await kasiyer.get('/api/veresiye')).data;
  const kayit = liste.musteriler.find((m) => m.id === musteriId);
  assert.ok(kayit);
  assert.ok(liste.ozet.toplam_alacak >= kayit.bakiye);

  const detay = (await kasiyer.get(`/api/veresiye/${musteriId}`)).data;
  assert.equal(detay.hareketler.length, 2);
  assert.equal(detay.hareketler[0].tip, 'tahsilat', 'en yeni hareket once');
  assert.equal(detay.hareketler[0].bakiye, detay.bakiye);
});

test('borcu olan musteri silinemez; limit guncellemesi gonderilmezse korunur', async () => {
  const sil = await admin.del(`/api/musteriler/${musteriId}`);
  assert.equal(sil.status, 400);

  const guncel = await admin.put(`/api/musteriler/${musteriId}`, { ad_soyad: 'Veresiye Test 2' });
  assert.equal(guncel.data.veresiye_limiti, 100);
  const limitsiz = await admin.put(`/api/musteriler/${musteriId}`, { ad_soyad: 'Veresiye Test 2', veresiye_limiti: null });
  assert.equal(limitsiz.data.veresiye_limiti, null);
});
