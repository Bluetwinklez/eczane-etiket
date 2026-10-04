const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { csvAyristir } = require('../server/csvIceAktar');

let sunucu;
let admin;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
});
after(() => sunucu.kapat());

test('CSV ayristirici: ayirac tespiti, tirnak, kacis, BOM', () => {
  assert.deepEqual(csvAyristir('﻿a;b\r\n"x;y";"he ""dedi"""\n'), [['a', 'b'], ['x;y', 'he "dedi"']]);
  assert.deepEqual(csvAyristir('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(csvAyristir('a\tb\n1\t2\n\n'), [['a', 'b'], ['1', '2']]);
});

const CSV = [
  'Ürün Adı;Barkod;Satış Fiyatı;Alış;Reçeteli;Ürün Tipi;Etken Madde;Kutu Gün;SKT',
  'Yeni Krem 50ml;8690000000011;1.249,90;800;Hayır;Dermokozmetik;;;31.12.2028',
  ';8699504010012;29,90;;;;;;',
  ';8699504010029;35,50;;;;;;',
  'Hatali;8690000000022;abc;;;;;;',
  'Vitamin D;8690000000033;99;;Evet;Gıda Takviyesi;Kolekalsiferol;60;'
].join('\n');

test('onizleme: yeni/guncelle/ayni/hata siniflandirmasi, hicbir sey yazilmaz', async () => {
  const r = (await admin.post('/api/ilaclar/ice-aktar', { csv: CSV, onizleme: true })).data;
  assert.deepEqual(r.ozet, { yeni: 2, guncelle: 1, ayni: 1, hata: 1 });
  const krem = r.satirlar.find((s) => s.barkod === '8690000000011');
  assert.equal(krem.alanlar.satis_fiyati, 1249.9);
  assert.equal(krem.alanlar.urun_tipi, 'dermokozmetik');
  assert.equal(krem.alanlar.skt, '2028-12-31');
  assert.deepEqual(r.satirlar.find((s) => s.barkod === '8699504010012').degisen, ['satis_fiyati']);
  assert.match(r.satirlar.find((s) => s.islem === 'hata').hatalar[0], /satis_fiyati/);
  assert.equal((await admin.get('/api/ilaclar?q=Yeni Krem')).data.length, 0);
});

test('hatali satir varken uygulanmaz; hata duzeltilince yazilir', async () => {
  assert.equal((await admin.post('/api/ilaclar/ice-aktar', { csv: CSV })).status, 400);
  const temiz = CSV.split('\n').filter((l) => !l.startsWith('Hatali')).join('\n');
  const r = await admin.post('/api/ilaclar/ice-aktar', { csv: temiz });
  assert.equal(r.status, 200);

  const krem = (await admin.get('/api/ilaclar?q=8690000000011')).data[0];
  assert.equal(krem.ad, 'Yeni Krem 50ml');
  assert.equal(krem.satis_fiyati, 1249.9);
  assert.equal(krem.stok, 0);
  const vit = (await admin.get('/api/ilaclar?q=8690000000033')).data[0];
  assert.equal(vit.receteli, 1);
  assert.equal(vit.etken_madde, 'kolekalsiferol');
  assert.equal(vit.kutu_gun, 60);

  const parol = (await admin.get('/api/ilaclar/1')).data;
  assert.equal(parol.satis_fiyati, 29.9);
  assert.equal(parol.ad, 'Parol 500mg 20 Tablet', 'bos hucre mevcut degeri silmez');
  assert.equal((await admin.get('/api/ilaclar/1/fiyat-gecmisi')).data[0].yeni_fiyat, 29.9);
});

test('baslik ve sablon kontrolleri', async () => {
  assert.equal((await admin.post('/api/ilaclar/ice-aktar', { csv: 'foo;bar\n1;2' })).status, 400);
  const sablon = await admin.get('/api/ilaclar/ice-aktar/sablon');
  assert.match(sablon.data, /Ad;Barkod/);
  const r = (await admin.post('/api/ilaclar/ice-aktar', { csv: sablon.data, onizleme: true })).data;
  assert.equal(r.ozet.yeni, 1, 'sablondaki ornek satir gecerli');
});
