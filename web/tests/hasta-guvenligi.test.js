const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { kuralUyarilari, kurallariBul } = require('../server/hastaGuvenligi');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
});

test('hazır kurallar: etken madde ya da ATC sınıfıyla eşleşir, elle girilen bayrak önceliklidir', () => {
  assert.ok(kurallariBul({ atc_kodu: 'C10AA05' }).some((k) => k.ad === 'Statinler'));
  assert.ok(kurallariBul({ etken_madde: 'Asetilsalisilik asit 100 mg' }).some((k) => /aspirin/.test(k.ad)));
  assert.equal(kurallariBul({ etken_madde: 'parasetamol' }).length, 0);

  const statin = { ad: 'Lipitor 20 mg', atc_kodu: 'C10AA05' };
  const gebe = kuralUyarilari({ yas: 30, durum: 'gebe', kilo: null }, statin);
  assert.equal(gebe[0].tur, 'gebelik');
  assert.equal(gebe[0].seviye, 'ciddi');
  assert.equal(kuralUyarilari({ yas: 30, durum: 'gebe' }, { ...statin, gebelik_uyari: 'dikkat' }).length, 0, 'elle bayrak varsa kural tekrar uyarmaz');

  const cipro = { ad: 'Cipro 500', etken_madde: 'siprofloksasin' };
  assert.match(kuralUyarilari({ yas: 15, durum: null }, cipro)[0].mesaj, /18 yaş altında/);
  assert.equal(kuralUyarilari({ yas: 20, durum: null }, cipro).length, 0);

  const ppi = kuralUyarilari({ yas: 72, durum: null }, { ad: 'Nexium', atc_kodu: 'A02BC05' });
  assert.equal(ppi[0].tur, 'yasli');
  assert.equal(ppi[0].seviye, 'hafif');

  const doz = kuralUyarilari({ yas: 4, durum: null, kilo: 16 }, { ad: 'Calpol', etken_madde: 'parasetamol' });
  assert.equal(doz[0].tur, 'doz');
  assert.match(doz[0].mesaj, /16 kg/);
});

test('satışta müşteri profiline göre uyarılar (gebelik, çocuk, ileri yaş, kilo)', async () => {
  const admin = await girisliIstemci(sunucu.base, 'admin');
  const ilaclar = (await admin.get('/api/ilaclar')).data;
  const id = (re) => ilaclar.find((i) => re.test(i.ad)).id;
  const yilOnce = (n) => `${new Date().getFullYear() - n}-01-01`;
  const yeni = async (ad, ek) => (await admin.post('/api/musteriler', { ad_soyad: ad, ...ek })).data.id;

  const gebe = await yeni('Gebe Test', { dogum_tarihi: yilOnce(30), gebelik_durumu: 'gebe' });
  const cocuk = await yeni('Çocuk Test', { dogum_tarihi: yilOnce(6) });
  const yasli = await yeni('Yaşlı Test', { dogum_tarihi: yilOnce(78) });
  await admin.post('/api/takip/olcumler', { musteri_id: cocuk, tip: 'kilo', deger1: 21 });

  const kontrol = async (m, re) => (await admin.post('/api/etkilesimler/kontrol', { musteri_id: m, ilac_ids: re.map(id) })).data.hasta;

  const g = await kontrol(gebe, [/Nurofen/]);
  assert.equal(g.filter((h) => h.tur === 'gebelik').length, 1, 'örnek üründe elle bayrak var; kural tekrar uyarmaz');
  const c = await kontrol(cocuk, [/Coraspin/, /Parol/]);
  assert.ok(c.some((h) => h.tur === 'yas' && /16 yaş altı/.test(h.mesaj)), 'aspirin <16 (örnek üründeki bayrak)');
  assert.ok(c.some((h) => h.tur === 'doz' && /21 kg/.test(h.mesaj)), 'parasetamol kilo hatırlatması');
  const y = await kontrol(yasli, [/Xanax/]);
  assert.ok(y.some((h) => h.tur === 'yasli'));

  // Bayraksız ürün: yalnızca hazır kurallar uyarır
  const cipro = (await admin.post('/api/ilaclar', { ad: 'Cipro Test 500 mg', satis_fiyati: 30, etken_madde: 'siprofloksasin' })).data.id;
  const lora = (await admin.post('/api/ilaclar', { ad: 'Lora Test 1 mg', satis_fiyati: 30, etken_madde: 'lorazepam' })).data.id;
  const k = async (m, ids) => (await admin.post('/api/etkilesimler/kontrol', { musteri_id: m, ilac_ids: ids })).data.hasta;
  assert.match((await k(cocuk, [cipro])).find((h) => h.tur === 'yas').mesaj, /Kinolonlar 18 yaş altında/);
  assert.match((await k(yasli, [lora])).find((h) => h.tur === 'yasli').mesaj, /Benzodiazepinler.*Beers/);
  assert.equal((await k(gebe, [lora])).find((h) => h.tur === 'gebelik').seviye, 'orta');
});
