const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');

let sunucu;
let admin;
let musteriId;
let ilacId;

function gunOnce(gun) {
  return new Date(Date.now() - gun * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  musteriId = (await admin.post('/api/musteriler', { ad_soyad: 'Kronik Hasta', telefon: '05550000000' })).data.id;
  ilacId = (await admin.post('/api/ilaclar', { ad: 'Kronik Ilac', satis_fiyati: 10, kutu_gun: 30, stok: 10 })).data.id;
});
after(() => sunucu.kapat());

test('kutu suresi dogrulanir ve guncellemede korunur', async () => {
  assert.equal((await admin.post('/api/ilaclar', { ad: 'X', satis_fiyati: 1, kutu_gun: 0 })).status, 400);
  const guncel = await admin.put(`/api/ilaclar/${ilacId}`, { ad: 'Kronik Ilac', satis_fiyati: 10 });
  assert.equal(guncel.data.kutu_gun, 30);
});

test('bitis tarihi son alim ve kutu sayisindan hesaplanir', async () => {
  const satis = await admin.post('/api/satislar', { musteri_id: musteriId, kalemler: [{ ilac_id: ilacId, adet: 1 }] });
  // Satisi 27 gun oncesine tasi: 30 gunluk kutu 3 gun sonra biter
  db.prepare('UPDATE satislar SET tarih = ? WHERE id = ?').run(gunOnce(27), satis.data.id);

  const liste = (await admin.get('/api/hatirlatmalar/ilac-bitis?gun=7')).data;
  const kayit = liste.find((r) => r.musteri_id === musteriId && r.ilac_id === ilacId);
  assert.ok(kayit);
  assert.equal(kayit.kalan_gun, 3);
  assert.equal(kayit.adet, 1);

  const dar = (await admin.get('/api/hatirlatmalar/ilac-bitis?gun=2')).data;
  assert.ok(!dar.some((r) => r.ilac_id === ilacId), '2 gunluk pencerede olmamali');
});

test('hatirlatma gonderilir ve ayni donem icin tekrar gonderilemez', async () => {
  const ilk = await admin.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: musteriId, ilac_id: ilacId, kanal: 'sms' });
  assert.equal(ilk.status, 201);
  assert.match(ilk.data.bildirim.mesaj, /Kronik Ilac/);
  assert.equal(ilk.data.bildirim.durum, 'simule');

  const tekrar = await admin.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: musteriId, ilac_id: ilacId, kanal: 'sms' });
  assert.equal(tekrar.status, 409);

  const eposta = await admin.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: musteriId, ilac_id: ilacId, kanal: 'email' });
  assert.equal(eposta.status, 409, 'kanal farkli olsa da donem ayni');

  const kayit = (await admin.get('/api/hatirlatmalar/ilac-bitis?gun=7')).data.find((r) => r.ilac_id === ilacId);
  assert.ok(kayit.hatirlatildi);
});

test('iade edilen kutu bitis hesabindan dusulur; tamami iadeyse listelenmez', async () => {
  const m = (await admin.post('/api/musteriler', { ad_soyad: 'Iade Eden', telefon: '05551111111' })).data.id;
  const satis = await admin.post('/api/satislar', { musteri_id: m, kalemler: [{ ilac_id: ilacId, adet: 2 }] });
  db.prepare('UPDATE satislar SET tarih = ? WHERE id = ?').run(gunOnce(55), satis.data.id);
  // 2 kutu = 60 gun -> 5 gun kaldi
  let kayit = (await admin.get('/api/hatirlatmalar/ilac-bitis?gun=7')).data.find((r) => r.musteri_id === m);
  assert.equal(kayit.kalan_gun, 5);

  await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: satis.data.kalemler[0].id, adet: 1 }] });
  // 1 kutu = 30 gun -> 25 gun once bitti
  kayit = (await admin.get('/api/hatirlatmalar/ilac-bitis?gun=7')).data.find((r) => r.musteri_id === m);
  assert.equal(kayit.kalan_gun, -25);

  await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: satis.data.kalemler[0].id, adet: 1 }] });
  kayit = (await admin.get('/api/hatirlatmalar/ilac-bitis?gun=7')).data.find((r) => r.musteri_id === m);
  assert.equal(kayit, undefined);
});

test('telefonu olmayan musteriye SMS gonderilemez', async () => {
  const m = (await admin.post('/api/musteriler', { ad_soyad: 'Telefonsuz' })).data.id;
  const satis = await admin.post('/api/satislar', { musteri_id: m, kalemler: [{ ilac_id: ilacId, adet: 1 }] });
  db.prepare('UPDATE satislar SET tarih = ? WHERE id = ?').run(gunOnce(29), satis.data.id);
  const r = await admin.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: m, ilac_id: ilacId, kanal: 'sms' });
  assert.equal(r.status, 400);
});
