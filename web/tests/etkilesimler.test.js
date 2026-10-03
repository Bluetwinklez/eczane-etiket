const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let kasiyer;
const ID = {};

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  for (const i of (await admin.get('/api/ilaclar')).data) ID[i.barkod] = i.id;
});
after(() => sunucu.kapat());

const ASPIRIN = '8699504010029';
const NUROFEN = '8699504010043';
const CIPRALEX = '8699504010050';
const CORASPIN = '8699504010074';
const AUGMENTIN = '8699504010036';
const PAROL = '8699504010012';

test('sepetteki etkilesimler seviyeye gore sirali doner', async () => {
  const r = await kasiyer.post('/api/etkilesimler/kontrol', { ilac_ids: [ID[NUROFEN], ID[CIPRALEX], ID[ASPIRIN]] });
  assert.equal(r.status, 200);
  const ciftler = r.data.etkilesimler.map((e) => [e.madde_a, e.madde_b].sort().join('+'));
  assert.ok(ciftler.includes('asetilsalisilik asit+ibuprofen'));
  assert.ok(ciftler.includes('essitalopram+ibuprofen'));
  assert.ok(ciftler.includes('asetilsalisilik asit+essitalopram'));
});

test('ayni etken maddeyi iceren iki urun mukerrer olarak isaretlenir', async () => {
  const r = await kasiyer.post('/api/etkilesimler/kontrol', { ilac_ids: [ID[ASPIRIN], ID[CORASPIN]] });
  assert.equal(r.data.mukerrer.length, 1);
  assert.equal(r.data.mukerrer[0].madde, 'asetilsalisilik asit');
  assert.equal(r.data.etkilesimler.length, 0);
});

test('musterinin son 90 gun alimi ve alerji notu kontrol edilir', async () => {
  const m = await kasiyer.post('/api/musteriler', { ad_soyad: 'Etkilesim Test', saglik_notu: 'Penisilin alerjisi var' });
  await kasiyer.post('/api/satislar', { musteri_id: m.data.id, kalemler: [{ ilac_id: ID[CIPRALEX], adet: 1 }] });

  const r = await kasiyer.post('/api/etkilesimler/kontrol', { ilac_ids: [ID[NUROFEN], ID[AUGMENTIN]], musteri_id: m.data.id });
  const gecmis = r.data.etkilesimler.find((e) => e.kaynak === 'gecmis');
  assert.ok(gecmis, 'Cipralex gecmis alimi ile Nurofen etkilesimi bulunmali');
  assert.equal(r.data.alerji.length, 1);
  assert.equal(r.data.alerji[0].madde, 'amoksisilin');
  assert.equal(r.data.alerji[0].eslesen, 'penisilin');

  const temiz = await kasiyer.post('/api/etkilesimler/kontrol', { ilac_ids: [ID[PAROL]] });
  assert.equal(temiz.data.etkilesimler.length + temiz.data.mukerrer.length + temiz.data.alerji.length, 0);
});

test('etkilesim kurali ekleme: yetki, normalizasyon ve tekrar kontrolu', async () => {
  const yetkisiz = await kasiyer.post('/api/etkilesimler', { madde_a: 'a', madde_b: 'b', seviye: 'orta', aciklama: 'x' });
  assert.equal(yetkisiz.status, 403);

  const yeni = await admin.post('/api/etkilesimler', { madde_a: 'Parasetamol', madde_b: 'Alprazolam', seviye: 'hafif', aciklama: 'Test kurali' });
  assert.equal(yeni.status, 201);
  assert.equal(yeni.data.madde_a, 'alprazolam', 'alfabetik ve kucuk harf saklanir');
  const tekrar = await admin.post('/api/etkilesimler', { madde_a: 'alprazolam', madde_b: 'parasetamol', seviye: 'orta', aciklama: 'x' });
  assert.equal(tekrar.status, 409);

  const r = await kasiyer.post('/api/etkilesimler/kontrol', { ilac_ids: [ID[PAROL], ID['8699504010081']] });
  assert.equal(r.data.etkilesimler[0].seviye, 'hafif');
});

test('ilac etken maddesi kaydedilir ve aramada bulunur', async () => {
  const yeni = await admin.post('/api/ilaclar', { ad: 'Etken Test', satis_fiyati: 5, etken_madde: 'Tramadol + Parasetamol' });
  assert.equal(yeni.data.etken_madde, 'tramadol, parasetamol');
  const arama = (await admin.get('/api/ilaclar?q=tramadol')).data;
  assert.ok(arama.some((i) => i.id === yeni.data.id));

  const r = await kasiyer.post('/api/etkilesimler/kontrol', { ilac_ids: [yeni.data.id, ID[CIPRALEX]] });
  assert.equal(r.data.etkilesimler[0].seviye, 'ciddi');
});
