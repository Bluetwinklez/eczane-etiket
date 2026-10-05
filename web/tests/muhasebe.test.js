const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { yerelSimdi } = require('../server/zaman');

let sunucu;
let admin;
let kasiyer;
const bugun = () => yerelSimdi().toISOString().slice(0, 10);

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('muhasebe yalnızca admin/eczacı; kasiyer ve anonim giremez', async () => {
  assert.equal((await fetch(sunucu.base + '/api/muhasebe/ozet')).status, 401);
  assert.equal((await kasiyer.get('/api/muhasebe/ozet')).status, 403);
  assert.equal((await admin.get('/api/muhasebe/ozet')).status, 200);
});

test('geçersiz tarih ve ters aralık reddedilir', async () => {
  assert.equal((await admin.get('/api/muhasebe/ozet?baslangic=abc')).status, 400);
  assert.equal((await admin.get('/api/muhasebe/gunluk?baslangic=2026-05-10&bitis=2026-05-01')).status, 400);
});

test('hasılat, iade, maliyet, gider, alış faturası ve net kâr birlikte tutarlı', async () => {
  const yeni = await admin.post('/api/ilaclar', { ad: 'Muhasebe Test', satis_fiyati: 100, alis_fiyati: 60 });
  const id = yeni.data.id;
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 20, parti_no: 'M1', skt: '2030-01-01' });

  const satis = await admin.post('/api/satislar', { kalemler: [{ ilac_id: id, adet: 10 }], odeme_tipi: 'nakit' });
  assert.equal(satis.status, 201);
  const kalemId = (await admin.get(`/api/satislar/${satis.data.id}`)).data.kalemler[0].id;
  const iade = await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: kalemId, adet: 2 }] });
  assert.equal(iade.status, 201);

  await admin.post('/api/giderler', { kategori: 'kira', tutar: 100, tarih: bugun() });
  await admin.post('/api/giderler', { kategori: 'tedarik', tutar: 999, tarih: bugun() });

  const ted = (await admin.post('/api/tedarikciler', { firma_adi: 'Muh Depo' })).data;
  const fatura = await admin.post(`/api/tedarikciler/${ted.id}/hareketler`, { tip: 'fatura', tutar: 1000, belge_no: 'F-1' });
  assert.equal(fatura.status, 201);
  await admin.post(`/api/tedarikciler/${ted.id}/hareketler`, { tip: 'odeme', tutar: 300, odeme_sekli: 'havale' });
  const alisIade = await admin.post('/api/muhasebe/alis-iadesi', { tedarikci_id: ted.id, tutar: 200, belge_no: 'IF-1' });
  assert.equal(alisIade.status, 201);
  assert.equal(alisIade.data.bakiye, 500);

  const o = (await admin.get('/api/muhasebe/ozet')).data;
  assert.equal(o.brut_hasilat, 1000);
  assert.equal(o.iade_tutari, 200);
  assert.equal(o.net_hasilat, 800);
  assert.equal(o.maliyet, 480); // 10x60 satış - 2x60 stoğa dönen iade
  assert.equal(o.brut_kar, 320);
  assert.equal(o.isletme_giderleri, 100); // tedarik gideri kâra dahil edilmez
  assert.equal(o.tedarik_giderleri, 999);
  assert.equal(o.net_kar, 220);
  assert.equal(o.alis_faturalari, 1000);
  assert.equal(o.alis_iadeleri, 200);
  assert.equal(o.net_alis, 800);
  assert.equal(o.tedarikci_odemeleri, 300);
  assert.equal(o.tedarikci_borcu, 500);

  const g = (await admin.get('/api/muhasebe/gunluk')).data;
  assert.equal(g.length, 1);
  assert.equal(g[0].net_kar, 220);

  const k = (await admin.get('/api/muhasebe/kasa')).data;
  assert.equal(k[0].nakit, 800); // 1000 satış - 200 iade
  assert.equal(k[0].iade, 200);

  const f = (await admin.get('/api/muhasebe/faturalar')).data;
  const satir = f.find((x) => x.belge_no === 'F-1');
  assert.equal(satir.tur, 'Fatura');
  assert.equal(satir.kalan, 500);
  assert.ok(f.some((x) => x.tur === 'Alış iadesi' && x.tutar === 200));
});

test('CSV ve PDF çıktıları üretilir', async () => {
  const csv = await fetch(sunucu.base + '/api/muhasebe/ozet?format=csv', { headers: { Cookie: admin.cerez() } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /Net kâr/);
  const pdf = await fetch(sunucu.base + '/api/muhasebe/kasa?format=pdf', { headers: { Cookie: admin.cerez() } });
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
});

test('alış iadesi doğrulaması', async () => {
  assert.equal((await admin.post('/api/muhasebe/alis-iadesi', { tedarikci_id: 9999, tutar: 5 })).status, 404);
  assert.equal((await admin.post('/api/muhasebe/alis-iadesi', { tedarikci_id: 1, tutar: -5 })).status, 400);
});
