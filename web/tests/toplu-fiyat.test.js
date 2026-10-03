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

test('onizleme fiyatlari degistirmez; uygula degistirir ve gecmise yazar', async () => {
  const once = (await admin.get('/api/ilaclar?urun_tipi=dermokozmetik')).data;
  const govde = { hedef: { tip: 'urun_tipi', deger: 'dermokozmetik' }, yuzde: 10, yuvarlama: 'doksan', onizleme: true };
  const onizleme = (await admin.post('/api/ilaclar/toplu-fiyat', govde)).data;
  assert.equal(onizleme.urun_sayisi, once.length);
  // 449 * 1.10 = 493.9 -> ,90 ile biten en yakin: 493.90
  const effaclar = onizleme.degisiklikler.find((d) => d.eski_satis === 449);
  assert.equal(effaclar.yeni_satis, 493.9);
  assert.deepEqual((await admin.get('/api/ilaclar?urun_tipi=dermokozmetik')).data.map((u) => u.satis_fiyati), once.map((u) => u.satis_fiyati));

  const uygula = await admin.post('/api/ilaclar/toplu-fiyat', { ...govde, onizleme: false });
  assert.equal(uygula.status, 200);
  const sonra = (await admin.get(`/api/ilaclar/${effaclar.id}`)).data;
  assert.equal(sonra.satis_fiyati, 493.9);
  const gecmis = (await admin.get(`/api/ilaclar/${effaclar.id}/fiyat-gecmisi`)).data;
  assert.equal(gecmis[0].yeni_fiyat, 493.9);
  // Diger tiplere dokunulmadi
  assert.equal((await admin.get('/api/ilaclar/1')).data.satis_fiyati, 24.9);
});

test('yuvarlama secenekleri ve zararina satis uyarisi', async () => {
  const r = (await admin.post('/api/ilaclar/toplu-fiyat', { hedef: { tip: 'kategori', deger: 'Agri Kesici' }, yuzde: -50, yuvarlama: 'lira', onizleme: true })).data;
  const parol = r.degisiklikler.find((d) => d.id === 1);
  assert.equal(parol.yeni_satis, 12, '24.90 * 0.5 = 12.45 -> 12');
  assert.equal(parol.zararina, true, 'alis 15.5 > satis 12');

  const alis = (await admin.post('/api/ilaclar/toplu-fiyat', { hedef: { tip: 'receteli' }, yuzde: 20, alan: 'alis', onizleme: true })).data;
  assert.ok(alis.degisiklikler.every((d) => d.yeni_satis === d.eski_satis), 'yalnizca alis degisir');
});

test('dogrulama ve yetki', async () => {
  assert.equal((await admin.post('/api/ilaclar/toplu-fiyat', { hedef: { tip: 'tumu' }, yuzde: 0 })).status, 400);
  assert.equal((await admin.post('/api/ilaclar/toplu-fiyat', { hedef: { tip: 'tumu' }, yuzde: -95 })).status, 400);
  assert.equal((await admin.post('/api/ilaclar/toplu-fiyat', { hedef: { tip: 'uzay' }, yuzde: 5 })).status, 400);
  assert.equal((await kasiyer.post('/api/ilaclar/toplu-fiyat', { hedef: { tip: 'tumu' }, yuzde: 5 })).status, 403);
});
