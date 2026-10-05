const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { itsListesiCoz } = require('../server/routes/its');

const GS = '\x1d';
const kod = (seri, lot = 'L1') => `010869950401001221${seri}${GS}17301231${GS}10${lot}`;

let sunucu;
let admin;
let kasiyer;
let ilacId;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  ilacId = (await admin.get('/api/ilaclar?q=8699504010012')).data[0].id;
  await admin.post(`/api/ilaclar/${ilacId}/stok`, { tip: 'giris', adet: 50, parti_no: 'L1', skt: '2030-12-31' });
});
after(() => sunucu.kapat());

test('ITS defteri yalnızca admin/eczacı; kasiyer göremez', async () => {
  assert.equal((await kasiyer.get('/api/its/hareketler')).status, 403);
  assert.equal((await admin.get('/api/its/hareketler')).status, 200);
});

test('karekodlu satış deftere yazılır; aynı seri ikinci kez satılamaz', async () => {
  const s1 = await admin.post('/api/satislar', { kalemler: [{ ilac_id: ilacId, adet: 1 }], karekodlar: [kod('S100')] });
  assert.equal(s1.status, 201);

  const tekrar = await admin.post('/api/satislar', { kalemler: [{ ilac_id: ilacId, adet: 1 }], karekodlar: [kod('S100')] });
  assert.equal(tekrar.status, 409);
  assert.match(tekrar.data.error, /daha önce satılmış/);

  const sorgu = await admin.get('/api/ilaclar/karekod?kod=' + encodeURIComponent(kod('S100')));
  assert.equal(sorgu.data.seri_durum, 'satis');
  assert.equal((await admin.get('/api/ilaclar/karekod?kod=' + encodeURIComponent(kod('YENI')))).data.seri_durum, null);

  const defter = (await admin.get('/api/its/hareketler')).data;
  assert.equal(defter.sayim.satis, 1);
  assert.equal(defter.satirlar[0].seri_no, 'S100');
  assert.equal(defter.satirlar[0].belge, `Satış #${s1.data.id}`);
});

test('geçersiz / eşleşmeyen / tekrarlı karekodlar satışı engeller (stok düşmez)', async () => {
  const once = (await admin.get('/api/ilaclar?q=8699504010012')).data[0].stok;
  const hepsi = (govde) => admin.post('/api/satislar', { kalemler: [{ ilac_id: ilacId, adet: 2 }], ...govde });
  assert.equal((await hepsi({ karekodlar: ['abc'] })).status, 400);
  assert.equal((await hepsi({ karekodlar: [kod('A1'), kod('A1')] })).status, 400);
  assert.equal((await hepsi({ karekodlar: [`010000000000000121X1${GS}17301231`] })).status, 400);
  assert.equal((await hepsi({ karekodlar: ['010869950401001217301231'] })).status, 400, 'seri no olmayan karekod');
  assert.equal((await admin.get('/api/ilaclar?q=8699504010012')).data[0].stok, once);
});

test('karekodlu iade seriyi tekrar stoğa alır; satılmamış seri iade edilemez', async () => {
  const satis = await admin.post('/api/satislar', { kalemler: [{ ilac_id: ilacId, adet: 1 }], karekodlar: [kod('S200')] });
  const kalemId = (await admin.get(`/api/satislar/${satis.data.id}`)).data.kalemler[0].id;

  const yanlis = await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: kalemId, adet: 1 }], karekodlar: [kod('S100')] });
  assert.equal(yanlis.status, 400);

  const iade = await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: kalemId, adet: 1 }], karekodlar: [kod('S200')] });
  assert.equal(iade.status, 201);
  assert.equal((await admin.get('/api/ilaclar/karekod?kod=' + encodeURIComponent(kod('S200')))).data.seri_durum, 'iade');

  // Iade edilen kutu tekrar satilabilir
  const yeniden = await admin.post('/api/satislar', { kalemler: [{ ilac_id: ilacId, adet: 1 }], karekodlar: [kod('S200')] });
  assert.equal(yeniden.status, 201);

  const gecmis = (await admin.get('/api/its/seri?kod=' + encodeURIComponent(kod('S200')))).data;
  assert.deepEqual(gecmis.satirlar.map((s) => s.tip).reverse(), ['satis', 'iade', 'satis']);
  assert.equal(gecmis.durum, 'satis');
});

test('karekodlu mal kabul deftere "giriş" yazar; stoktaki seri tekrar girilemez', async () => {
  const govde = (seri) => ({ kalemler: [{ ilac_id: ilacId, adet: 1, alis_fiyati: 10, karekodlar: [kod(seri)] }] });
  const ilk = await admin.post('/api/mal-kabul', govde('G1'));
  assert.equal(ilk.status, 201);
  const ikinci = await admin.post('/api/mal-kabul', govde('G1'));
  assert.equal(ikinci.status, 409);
  const baska = await admin.post('/api/mal-kabul', { kalemler: [{ ilac_id: ilacId, adet: 1, alis_fiyati: 10, karekodlar: [`010000000000000121X1${GS}17301231`] }] });
  assert.equal(baska.status, 400);
  const girisler = (await admin.get('/api/its/hareketler?tip=giris')).data;
  assert.equal(girisler.satirlar.length, 1);
  assert.match(girisler.satirlar[0].belge, /Mal kabul #/);
});

test('defter CSV ve PDF verir; geçersiz parametre reddedilir', async () => {
  const csv = await fetch(sunucu.base + '/api/its/hareketler?format=csv', { headers: { Cookie: admin.cerez() } });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /Seri no/);
  const pdf = await fetch(sunucu.base + '/api/its/hareketler?format=pdf', { headers: { Cookie: admin.cerez() } });
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  assert.equal((await admin.get('/api/its/hareketler?baslangic=x')).status, 400);
  assert.equal((await admin.get('/api/its/hareketler?tip=yok')).status, 400);
});

test('ITS listesi çözümü: ayraç, başlık ve adet kolonu', () => {
  const a = itsListesiCoz('GTIN;Adet\n08699504010012;5\n8699504010012;2\nabc;1');
  assert.equal(a.toplam.get('8699504010012'), 7);
  assert.equal(a.gecersiz, 1);
  const b = itsListesiCoz('08699504010012\n08699504010012\n08699504010012');
  assert.equal(b.toplam.get('8699504010012'), 3, 'adet kolonu yoksa her satır bir kutu');
  assert.ok(itsListesiCoz('').hata);
  assert.ok(itsListesiCoz('merhaba\ndünya').hata);
});

test('stok eşitleme: farklar, eşleşenler ve tanımsız GTIN ayrılır', async () => {
  const sistem = (await admin.get('/api/ilaclar?q=8699504010012')).data[0].stok;
  const sonuc = (await admin.post('/api/its/karsilastir', { metin: `GTIN;Adet\n08699504010012;${sistem + 3}\n09999999999994;4` })).data;
  const satir = sonuc.satirlar.find((s) => s.gtin === '8699504010012');
  assert.equal(satir.durum, 'its_fazla');
  assert.equal(satir.fark, 3);
  assert.equal(sonuc.satirlar.find((s) => s.gtin === '9999999999994').durum, 'tanimsiz');
  assert.equal(sonuc.ozet.tanimsiz, 1);

  const esit = (await admin.post('/api/its/karsilastir', { metin: `GTIN;Adet\n8699504010012;${sistem}` })).data;
  assert.equal(esit.satirlar.find((s) => s.gtin === '8699504010012').durum, 'eslesiyor');
  assert.equal((await admin.post('/api/its/karsilastir', { metin: '' })).status, 400);
  assert.equal((await kasiyer.post('/api/its/karsilastir', { metin: 'x' })).status, 403);
});
