const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { degerlendir } = require('../server/takip');
const { yerelSimdi } = require('../server/zaman');

let sunucu;
let admin;
let kasiyer;
let musteriId;
const gun = (n) => {
  const d = yerelSimdi();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  musteriId = (await admin.get('/api/musteriler')).data[0].id;
});
after(() => sunucu.kapat());

test('ölçüm değerlendirmesi: tansiyon, şeker (aç/tok), SpO2, ateş eşikleri', () => {
  assert.equal(degerlendir({ tip: 'tansiyon', deger1: 120, deger2: 78 }).seviye, 'ok');
  assert.equal(degerlendir({ tip: 'tansiyon', deger1: 132, deger2: 80 }).metin, 'Yüksek-normal');
  assert.equal(degerlendir({ tip: 'tansiyon', deger1: 150, deger2: 85 }).seviye, 'warn');
  assert.equal(degerlendir({ tip: 'tansiyon', deger1: 185, deger2: 100 }).seviye, 'danger');
  assert.equal(degerlendir({ tip: 'seker', deger1: 110, aclik: 'ac' }).metin, 'Açlık şekeri sınırda');
  assert.equal(degerlendir({ tip: 'seker', deger1: 110, aclik: 'tok' }).seviye, 'ok');
  assert.equal(degerlendir({ tip: 'seker', deger1: 65, aclik: 'tok' }).seviye, 'danger');
  assert.equal(degerlendir({ tip: 'spo2', deger1: 93 }).seviye, 'warn');
  assert.equal(degerlendir({ tip: 'ates', deger1: 39.2 }).seviye, 'danger');
});

test('ölçüm kaydı: kasiyer girebilir, doğrulama, son değer özeti; silme yalnız eczacı/yönetici', async () => {
  const yaz = (g, c = kasiyer) => c.post('/api/takip/olcumler', { musteri_id: musteriId, ...g });
  assert.equal((await yaz({ tip: 'yok', deger1: 1 })).status, 400);
  assert.equal((await yaz({ tip: 'tansiyon', deger1: 140 })).status, 400, 'küçük tansiyon zorunlu');
  assert.equal((await yaz({ tip: 'tansiyon', deger1: 80, deger2: 120 })).status, 400, 'büyük < küçük olamaz');
  assert.equal((await yaz({ tip: 'ates', deger1: 50 })).status, 400);
  assert.equal((await yaz({ tip: 'seker', deger1: 120, aclik: 'ac', tarih: '2026-13-01' })).status, 400);
  assert.equal((await kasiyer.post('/api/takip/olcumler', { musteri_id: 99999, tip: 'nabiz', deger1: 70 })).status, 404);
  const t1 = await yaz({ tip: 'tansiyon', deger1: 150, deger2: 95, tarih: '2026-09-01' });
  assert.equal(t1.status, 201);
  assert.equal(t1.data.degerlendirme.seviye, 'warn');
  await yaz({ tip: 'tansiyon', deger1: 125, deger2: 80 });
  const s = await yaz({ tip: 'seker', deger1: '131,5', aclik: 'ac' });
  assert.equal(s.data.deger1, 131.5);
  const l = (await kasiyer.get(`/api/takip/olcumler?musteri_id=${musteriId}`)).data;
  assert.equal(l.olcumler.length, 3);
  assert.equal(l.son.tansiyon.deger1, 125, 'en yeni ölçüm özet olur');
  assert.equal((await kasiyer.get(`/api/takip/olcumler?musteri_id=${musteriId}&tip=seker`)).data.olcumler.length, 1);
  assert.equal((await kasiyer.get('/api/takip/olcumler')).status, 400);
  assert.equal((await kasiyer.del(`/api/takip/olcumler/${t1.data.id}`)).status, 403);
  assert.equal((await admin.del(`/api/takip/olcumler/${t1.data.id}`)).status, 204);
});

test('raporlar: durum (aktif/yaklaşan/bitti), doğrulama, yetki ve bildirim merkezi', async () => {
  const ekle = (g, c = admin) => c.post('/api/takip/raporlar', { musteri_id: musteriId, ...g });
  assert.equal((await ekle({ tani: 'Hipertansiyon', bitis: gun(10) }, kasiyer)).status, 403);
  assert.equal((await ekle({ tani: 'X' })).status, 400, 'bitiş zorunlu');
  assert.equal((await ekle({ bitis: gun(10) })).status, 400, 'tanı veya ilaç gerekli');
  assert.equal((await ekle({ tani: 'X', baslangic: gun(5), bitis: gun(1) })).status, 400);
  const yakin = await ekle({ rapor_no: 'R-1', tani: 'I10 Hipertansiyon', ilac: 'Ramipril', bitis: gun(10) });
  assert.equal(yakin.status, 201);
  assert.equal(yakin.data.durum, 'yaklasan');
  assert.equal(yakin.data.kalan_gun, 10);
  await ekle({ tani: 'E11 Diyabet', bitis: gun(200) });
  await ekle({ tani: 'Eski', bitis: gun(-3) });
  const l = (await kasiyer.get('/api/takip/raporlar')).data;
  assert.deepEqual(l.sayim, { aktif: 1, yaklasan: 1, bitti: 1 });
  assert.equal((await kasiyer.get('/api/takip/raporlar?durum=bitti')).data.raporlar[0].tani, 'Eski');
  const zil = (await kasiyer.get('/api/bildirim-merkezi')).data;
  assert.equal((zil.ogeler || zil).find((o) => o.kod === 'rapor_bitiyor').sayi, 1);
  const g = await admin.put(`/api/takip/raporlar/${yakin.data.id}`, { bitis: gun(100) });
  assert.equal(g.data.durum, 'aktif');
  assert.equal((await admin.del(`/api/takip/raporlar/${yakin.data.id}`)).status, 204);
  assert.equal((await admin.del(`/api/takip/raporlar/${yakin.data.id}`)).status, 404);
});
