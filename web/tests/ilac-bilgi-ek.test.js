const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { xlsxYap } = require('./xlsxYap');
const { urunAdiCoz, dermaTahmin, DERMA_AGACI } = require('../server/ilacBilgi');

let sunucu;
let admin;
let kasiyer;
let parol;

const BASLIK = ['İlaç Adı', 'Barkod', 'ATC Kodu', 'ATC Adı', 'Firma Adı', 'Reçete Türü', 'Durumu'];
before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  parol = (await admin.get('/api/ilaclar?q=8699504010012')).data[0];
  const liste = xlsxYap([
    {
      ad: 'AKTİF ÜRÜNLER LİSTESİ',
      satirlar: [
        BASLIK,
        ['PAROL 500 MG 30 TABLET', '8690000000101', 'N02BE01', 'paracetamol', 'ATABAY', 'Normal', 'Aktif'],
        ['PAROL 120 MG/5 ML 150 ML ORAL SUSPANSIYON', '8690000000102', 'N02BE01', 'paracetamol', 'ATABAY', 'Normal', 'Aktif'],
        ['PAROLEX 5 MG 10 TABLET', '8690000000103', 'A01', 'x', 'B', 'Normal', 'Aktif']
      ]
    },
    { ad: 'PASİF ÜRÜNLER LİSTESİ', satirlar: [BASLIK, ['PAROL 1000 MG 10 TABLET', '8690000000104', 'N02BE01', 'paracetamol', 'ATABAY', 'Normal', 'Pasif']] }
  ]);
  await fetch(sunucu.base + '/api/titck/yukle', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Cookie: admin.cerez() }, body: liste });
});
after(() => sunucu.kapat());

test('ürün adı ayrıştırma: marka, hat, doz, ambalaj', () => {
  assert.deepEqual(urunAdiCoz('PAROL 120 MG/5 ML 150 ML ORAL SUSPANSIYON'), { marka: 'PAROL', hat: 'PAROL', doz: '120 MG/5 ML', ambalaj: '150 ML ORAL SUSPANSIYON' });
  assert.equal(urunAdiCoz('Parol 500mg 20 Tablet').doz, '500 MG', 'boşluksuz yazım aynı doza düşer');
  assert.equal(urunAdiCoz('ABILIFY MAINTENA FLAKON 400 mg 1 flakon').hat, 'ABILIFY MAINTENA FLAKON');
  assert.equal(urunAdiCoz('DRYEX %0,15 GOZ DAMLASI').doz, '%0,15');
  assert.equal(urunAdiCoz('Cerrahi Maske').doz, null);
});

test('ürün ailesi: katalog + aktif TİTCK ürünleri, hat → doz → ambalaj; başka marka ve pasifler girmez', async () => {
  const a = (await kasiyer.get(`/api/ilac-bilgi/${parol.id}/aile`)).data;
  assert.equal(a.marka, 'PAROL');
  const parolHat = a.hatlar.find((h) => h.hat === 'PAROL');
  const dozlar = parolHat.dozlar.map((d) => d.doz);
  assert.ok(dozlar.includes('500 MG') && dozlar.includes('120 MG/5 ML'));
  assert.ok(!dozlar.includes('1000 MG'), 'pasif ürün gösterilmez');
  const d500 = parolHat.dozlar.find((d) => d.doz === '500 MG').urunler;
  assert.ok(d500.some((u) => u.secili && u.katalogda));
  assert.ok(d500.some((u) => !u.katalogda && u.barkod === '8690000000101'));
  assert.ok(!JSON.stringify(a).includes('PAROLEX'), 'benzer adlı başka marka karışmaz');
  assert.equal((await kasiyer.get('/api/ilac-bilgi/99999/aile')).status, 404);
});

test('karşılaştırma: 2-4 ürün, en ucuz işaretlenir, hasta ödemesi hesaplanır', async () => {
  const urunler = (await admin.get('/api/ilaclar')).data.slice(0, 3);
  assert.equal((await kasiyer.get(`/api/ilac-bilgi/karsilastir?id=${urunler[0].id}`)).status, 400);
  assert.equal((await kasiyer.get(`/api/ilac-bilgi/karsilastir?id=${urunler[0].id}&id=99999`)).status, 404);
  await admin.put(`/api/ilac-bilgi/${urunler[0].id}`, { kamu_fiyati: 1, kamu_odenecek: 1 });
  const k = (await kasiyer.get(`/api/ilac-bilgi/karsilastir?${urunler.map((u) => 'id=' + u.id).join('&')}`)).data;
  assert.equal(k.length, 3);
  assert.equal(k.filter((u) => u.en_ucuz).length >= 1, true);
  assert.equal(k[0].hasta_oder != null, true);
  assert.equal(k[1].hasta_oder, null, 'kamu fiyatı yoksa hesaplanmaz');
});

test('FF sütunu: aynı kayıtta PSF ve KF varsa fark', async () => {
  const csv = `barkod;PSF;KF;KÖ\n${parol.barkod};30,00;22,50;22,50`;
  assert.equal((await admin.post('/api/ilac-bilgi/ice-aktar', { csv })).status, 200);
  const kart = (await kasiyer.get(`/api/ilac-bilgi/${parol.id}`)).data;
  assert.equal(kart.hareketler.find((h) => h.psf === 30 && h.kf === 22.5).ff, 7.5);
  assert.ok(kart.secenekler.derma['Güneş Bakımı'].includes('Yüz güneş kremi'));
});

test('dermokozmetik: tahmin kuralları, kayıt doğrulaması, ağaç sayımı, otomatik sınıflandırma ve gezgin süzgeci', async () => {
  assert.deepEqual(dermaTahmin('Nivea Duş Jeli'), { ana: 'Kişisel Bakım', alt: 'Duş jeli ve sabun' });
  assert.deepEqual(dermaTahmin('La Roche Anthelios SPF50+'), { ana: 'Güneş Bakımı', alt: 'Yüz güneş kremi' });
  for (const [ana, alt] of Object.entries(DERMA_AGACI)) assert.ok(alt.length >= 6, ana);

  const urunler = (await admin.get('/api/ilaclar?urun_tipi=dermokozmetik')).data;
  assert.ok(urunler.length >= 2);
  const url = `/api/ilac-bilgi/${urunler[0].id}`;
  assert.equal((await admin.put(url, { derma_ana: 'Yok' })).status, 400);
  assert.equal((await admin.put(url, { derma_ana: 'Saç Bakımı', derma_alt: 'Pudra' })).status, 400);
  assert.equal((await kasiyer.post('/api/ilac-bilgi/derma-siniflandir', { onizleme: true })).status, 403);

  const on = (await admin.post('/api/ilac-bilgi/derma-siniflandir', { onizleme: true })).data;
  assert.equal(on.atanan + on.atanamayan, urunler.length);
  assert.equal((await admin.get('/api/ilac-bilgi/derma-agaci')).data.siniflanmamis, urunler.length, 'önizleme kaydetmez');
  const uygula = (await admin.post('/api/ilac-bilgi/derma-siniflandir', {})).data;
  assert.ok(uygula.atanan >= 1);
  const agac = (await kasiyer.get('/api/ilac-bilgi/derma-agaci')).data;
  assert.equal(agac.siniflanmamis, uygula.atanamayan);
  const dolu = agac.agac.find((a) => a.adet > 0);
  const g = (await kasiyer.get('/api/ilac-bilgi/gezgin?ana=' + encodeURIComponent(dolu.ana))).data;
  assert.equal(g.toplam, dolu.adet);
  assert.ok(g.urunler.every((u) => u.derma_ana === dolu.ana));
});
