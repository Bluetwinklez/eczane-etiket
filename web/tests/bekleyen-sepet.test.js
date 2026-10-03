const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let kasiyer;
let eczaci;

before(async () => {
  sunucu = await sunucuBaslat();
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  eczaci = await girisliIstemci(sunucu.base, 'eczaci');
});
after(() => sunucu.kapat());

test('sepet bekletilir, ayni subede baska kasada gorunur ve geri alininca silinir', async () => {
  const veri = { sepet: [{ ilac_id: 1, ad: 'Parol', adet: 2, satis_fiyati: 24.9, mevcutStok: 100 }], musteri_id: 1, odeme_tipi: 'nakit' };
  const r = await kasiyer.post('/api/satislar/bekleyen', { etiket: 'Ahmet bey', veri });
  assert.equal(r.status, 201);

  const liste = (await eczaci.get('/api/satislar/bekleyen')).data;
  assert.equal(liste.length, 1);
  assert.equal(liste[0].etiket, 'Ahmet bey');
  assert.equal(liste[0].veri.sepet[0].adet, 2);

  const geri = await eczaci.post(`/api/satislar/bekleyen/${r.data.id}/geri-al`, {});
  assert.deepEqual(geri.data, veri);
  assert.equal((await kasiyer.get('/api/satislar/bekleyen')).data.length, 0);
  assert.equal((await kasiyer.post(`/api/satislar/bekleyen/${r.data.id}/geri-al`, {})).status, 404);
});

test('bos sepet bekletilemez; silinebilir', async () => {
  assert.equal((await kasiyer.post('/api/satislar/bekleyen', { veri: { sepet: [] } })).status, 400);
  const r = await kasiyer.post('/api/satislar/bekleyen', { veri: { sepet: [{ ilac_id: 1, adet: 1 }] } });
  assert.equal((await kasiyer.del(`/api/satislar/bekleyen/${r.data.id}`)).status, 204);
});
