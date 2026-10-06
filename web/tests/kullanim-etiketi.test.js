const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const K = require('../public/js/kullanimEtiketi');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
});

test('kullanım kısaltmaları açık cümleye çevrilir', () => {
  assert.equal(K.kullanimMetni('2x1 tok', 'Parol 500mg 20 Tablet'), 'Günde 2 kez 1 tablet, tok karnına.');
  assert.equal(K.kullanimMetni('3x5 ml', 'Augmentin Şurup'), 'Günde 3 kez 5 ml.');
  assert.equal(K.kullanimMetni('3x1', 'Augmentin BID Süspansiyon'), 'Günde 3 kez 1 ölçek.');
  assert.equal(K.kullanimMetni('1x1 sabah aç', 'Beloc'), 'Günde 1 kez 1 tablet, sabah, aç karnına.');
  assert.equal(K.kullanimMetni('3x1/2 tok 7 gün', 'Majezik'), 'Günde 3 kez yarım tablet, tok karnına, 7 gün kullanınız.');
  assert.equal(K.kullanimMetni('2x1', 'Bepanthen Krem'), 'Günde 2 kez sürünüz.');
  assert.equal(K.kullanimMetni('1x2 akşam', 'Otrivine damla'), 'Günde 1 kez 2 damla, akşam.');
  assert.equal(K.kullanimMetni('günde bir kez yatmadan önce', 'X'), 'Günde bir kez yatmadan önce', 'tanınmayan metin aynen kalır');
  assert.equal(K.kullanimMetni('bacak ağrısında', 'X'), 'Bacak ağrısında', '"ac" kelime içinde aç sayılmaz');
  assert.equal(K.kullanimMetni('', 'X'), '');
  assert.match(K.etiketHtml({ ilac: 'A<b>', kullanim: 'x', hasta: '', tarih: '1.1.2026', eczane: 'E' }), /A&lt;b&gt;/);
});

test('satıştan kullanım etiketi verisi: eczane, hasta, kalem kullanımları', async () => {
  const kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  const ilac = (await kasiyer.get('/api/ilaclar')).data.find((i) => /Parol/.test(i.ad));
  const musteri = (await kasiyer.get('/api/musteriler')).data[0];
  const s = await kasiyer.post('/api/satislar', { musteri_id: musteri.id, odeme_tipi: 'nakit', kalemler: [{ ilac_id: ilac.id, adet: 2, kullanim: '3x1 tok' }] });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const e = (await kasiyer.get(`/api/satislar/${s.data.id}/kullanim-etiketleri`)).data;
  assert.equal(e.musteri_adi, musteri.ad_soyad);
  assert.ok(e.sube_adi);
  assert.deepEqual(e.kalemler.map((k) => [k.ilac_adi, k.adet, k.kullanim]), [[ilac.ad, 2, '3x1 tok']]);
  assert.equal((await kasiyer.get('/api/satislar/999999/kullanim-etiketleri')).status, 404);
});
