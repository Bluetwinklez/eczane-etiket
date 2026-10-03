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

test('kullanim karti: ilaclar, son kullanim talimati, etkilesim ve alerji', async () => {
  const m = (await admin.post('/api/musteriler', { ad_soyad: 'Kart Hasta', saglik_notu: 'Penisilin alerjisi' })).data.id;
  await admin.post('/api/satislar', { musteri_id: m, kalemler: [{ ilac_id: 4, adet: 1, kullanim: 'Gunde 2x1 tok' }] }); // Nurofen
  await admin.post('/api/satislar', { musteri_id: m, kalemler: [{ ilac_id: 5, adet: 1, kullanim: 'Sabah 1' }, { ilac_id: 3, adet: 1 }] }); // Cipralex, Augmentin
  await admin.post('/api/satislar', { musteri_id: m, kalemler: [{ ilac_id: 4, adet: 1 }, { ilac_id: 11, adet: 1 }] }); // Nurofen tekrar (talimatsiz), dermokozmetik

  const kart = (await admin.get(`/api/musteriler/${m}/kullanim-karti`)).data;
  const adlar = kart.ilaclar.map((i) => i.ad);
  assert.ok(adlar.includes('Nurofen 400mg 24 Tablet'));
  assert.ok(!adlar.some((a) => a.includes('Effaclar')), 'dermokozmetik karta girmez');
  assert.equal(kart.ilaclar.find((i) => i.id === 4).kullanim, 'Gunde 2x1 tok', 'son dolu talimat');
  assert.equal(kart.ilaclar.find((i) => i.id === 4).toplam_adet, 2);
  assert.ok(kart.etkilesimler.some((e) => [e.madde_a, e.madde_b].sort().join() === 'essitalopram,ibuprofen'));
  assert.equal(kart.alerji[0].madde, 'amoksisilin');
});

test('toplu mesaj yalnizca ileti onayli ve iletisim bilgisi olan musterilere gider', async () => {
  await admin.post('/api/musteriler', { ad_soyad: 'Onayli Ali', telefon: '05550000001', ileti_izni: true });
  await admin.post('/api/musteriler', { ad_soyad: 'Onaysiz Veli', telefon: '05550000002' });
  await admin.post('/api/musteriler', { ad_soyad: 'Telefonsuz Ayse', ileti_izni: true });

  const on = (await admin.post('/api/bildirimler/toplu', { segment: 'tumu', kanal: 'sms', mesaj: 'Merhaba {ad}, indirim basladi', onizleme: true })).data;
  assert.equal(on.alici_sayisi, 1);
  assert.deepEqual(on.ornek_alicilar, ['Onayli Ali']);
  assert.equal(on.ornek_mesaj, 'Merhaba Onayli, indirim basladi');

  const once = (await admin.get('/api/bildirimler')).data.length;
  const r = (await admin.post('/api/bildirimler/toplu', { segment: 'tumu', kanal: 'sms', mesaj: 'Merhaba {ad}' })).data;
  assert.equal(r.alici_sayisi, 1);
  assert.equal(r.sonuc.simule, 1);
  assert.equal((await admin.get('/api/bildirimler')).data.length, once + 1);
});

test('segmentler: dermokozmetik alanlar; dogrulamalar', async () => {
  const d = (await admin.post('/api/musteriler', { ad_soyad: 'Dermo Seven', telefon: '05550000003', ileti_izni: true })).data.id;
  await admin.post('/api/satislar', { musteri_id: d, kalemler: [{ ilac_id: 11, adet: 1 }] });
  const on = (await admin.post('/api/bildirimler/toplu', { segment: 'dermokozmetik', kanal: 'sms', mesaj: 'x', onizleme: true })).data;
  assert.deepEqual(on.ornek_alicilar, ['Dermo Seven']);
  assert.equal((await admin.post('/api/bildirimler/toplu', { segment: 'yok', mesaj: 'x' })).status, 400);
  assert.equal((await admin.post('/api/bildirimler/toplu', { segment: 'tumu', mesaj: ' ' })).status, 400);
  assert.equal((await admin.post('/api/bildirimler/toplu', { segment: 'tumu', mesaj: 'a'.repeat(460) })).status, 400);
  const seg = (await admin.get('/api/bildirimler/toplu/segmentler')).data;
  assert.ok(seg.some((s) => s.kod === 'kronik'));
});

test('ileti izni guncellemede gonderilmezse korunur', async () => {
  const m = (await admin.post('/api/musteriler', { ad_soyad: 'Izinli', ileti_izni: true })).data;
  const g = (await admin.put(`/api/musteriler/${m.id}`, { ad_soyad: 'Izinli 2' })).data;
  assert.equal(g.ileti_izni, 1);
});
