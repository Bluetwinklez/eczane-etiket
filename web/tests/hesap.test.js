const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../public/js/hesap');

test('kiloya göre doz: parasetamol 20 kg, şurup ml ve günlük üst sınır', () => {
  const r = H.kiloDozu({ kilo: 20, ...H.ON_AYARLAR.parasetamol });
  assert.deepEqual(r.tek_doz_mg, [200, 300]);
  assert.deepEqual(r.tek_doz_ml, [8.5, 12.5]); // 120 mg/5 ml = 24 mg/ml; 0,5 ml'ye yuvarlanır
  assert.equal(r.gunluk_max_mg, 1500);
  assert.deepEqual(r.uyarilar, []);
});

test('kiloya göre doz: yetişkin tek doz sınırı ve hatalı girdiler', () => {
  const r = H.kiloDozu({ kilo: 90, ...H.ON_AYARLAR.parasetamol });
  assert.equal(r.tek_doz_mg[1], 1000);
  assert.equal(r.uyarilar.length, 1);
  assert.ok(H.kiloDozu({ kilo: 0, ...H.ON_AYARLAR.ibuprofen }).hata);
  assert.ok(H.kiloDozu({ kilo: 10, minMgKg: 5, maxMgKg: 2 }).hata);
});

test('kullanım şekli ve kutu bitiş tarihi', () => {
  assert.deepEqual(H.kullanimCoz('2x1'), { kez: 2, miktar: 1, gunluk: 2 });
  assert.deepEqual(H.kullanimCoz('3 x 5 ml'), { kez: 3, miktar: 5, gunluk: 15 });
  assert.equal(H.kullanimCoz('1x1/2').gunluk, 0.5);
  assert.equal(H.kullanimCoz('Günde 2 kez 1').gunluk, 2);
  assert.equal(H.kullanimCoz('aç karnına'), null);
  const r = H.kutuBitis({ kutuIcerik: 28, kutuAdedi: 2, kullanim: '2x1', baslangic: '2026-10-01' });
  assert.equal(r.gun, 28);
  assert.equal(r.bitis, '2026-10-29');
  assert.ok(H.kutuBitis({ kutuIcerik: 20, kullanim: 'bilinmiyor' }).hata);
});

test('şişe yeter mi, VKİ/VYA, kreatinin klirensi, maliyet-kâr', () => {
  assert.deepEqual(H.siseYeter({ siseMl: 150, tekDozMl: 5, gundeKez: 3, tedaviGun: 14 }), { gunluk_ml: 15, yeter_gun: 10, gereken_sise: 2 });
  const v = H.vki({ kilo: 70, boyCm: 175 });
  assert.equal(v.vki, 22.9);
  assert.equal(v.sinif, 'Normal');
  assert.equal(v.vya_m2, 1.84);
  const k = H.kreatininKlirensi({ yas: 70, kilo: 60, kreatinin: 1.2, kadin: true });
  assert.equal(k.klirens, 41.3);
  assert.equal(k.evre, 'Orta derecede azalmış');
  const m = H.maliyetKar({ alis: 110, adet: 10, mf: 1, satis: 150, kdvOrani: 10 });
  assert.equal(m.birim_maliyet, 100);
  assert.equal(m.kar, 45.45);
  assert.equal(m.kar_marji_yuzde, 33.3); // KDV hariç: satış 136,36 − maliyet 90,91
});
