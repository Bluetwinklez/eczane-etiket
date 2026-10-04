const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');
const { TABLO_SIRASI } = require('../server/yedek');

let sunucu;
let admin;
let kasiyer;
const stok = (ilacId) => db.prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = 1').get(ilacId).stok;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('yedek tüm veri tablolarını kapsar (oturum, ayar ve işlem kaydı hariç)', () => {
  const tablolar = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  const eksik = tablolar.filter((t) => !TABLO_SIRASI.includes(t) && !['ayarlar', 'oturumlar', 'islem_kayitlari'].includes(t));
  assert.deepEqual(eksik, []);
});

test('soğuk zincir: aralık dışı ölçüm işaretlenir ve bildirim merkezine düşer', async () => {
  assert.equal((await kasiyer.post('/api/kalite/sicaklik', { sicaklik: 'abc' })).status, 400);
  assert.equal((await kasiyer.post('/api/kalite/sicaklik', { sicaklik: '' })).status, 400);
  const normal = (await kasiyer.post('/api/kalite/sicaklik', { sicaklik: 4.5 })).data;
  assert.equal(normal.aralik_disi, 0);
  const sicak = (await kasiyer.post('/api/kalite/sicaklik', { sicaklik: 11, dolap: 'Aşı dolabı' })).data;
  assert.equal(sicak.aralik_disi, 1);
  const r = (await kasiyer.get('/api/kalite/sicaklik')).data;
  assert.equal(r.ozet.olcum, 2);
  assert.equal(r.ozet.aralik_disi, 1);
  assert.equal(r.ozet.en_yuksek, 11);
  const zil = (await kasiyer.get('/api/bildirim-merkezi')).data;
  const ogeler = zil.ogeler || zil;
  assert.ok(ogeler.some((o) => o.kod === 'sicaklik_aralik_disi'));
});

test('geri çağırma: partiden kime satıldığını bulur, kalan stoğu çeker', async () => {
  const ilac = (await admin.post('/api/ilaclar', { ad: 'Test Şurup', satis_fiyati: 50, stok: 10, parti_no: 'GC-1' })).data;
  const musteri = (await admin.post('/api/musteriler', { ad_soyad: 'Ali Veli', telefon: '05550000000' })).data;
  await kasiyer.post('/api/satislar', { musteri_id: musteri.id, kalemler: [{ ilac_id: ilac.id, adet: 3 }] });
  assert.equal((await kasiyer.get(`/api/kalite/geri-cagirma/sorgu?ilac_id=${ilac.id}&parti_no=GC-1`)).status, 403);

  const sorgu = (await admin.get(`/api/kalite/geri-cagirma/sorgu?ilac_id=${ilac.id}&parti_no=GC-1`)).data;
  assert.equal(sorgu.satislar.length, 1);
  assert.equal(sorgu.satislar[0].musteri_adi, 'Ali Veli');
  assert.equal(sorgu.satislar[0].adet, 3);
  assert.equal(sorgu.partiler[0].miktar, 7);

  assert.equal((await admin.post('/api/kalite/geri-cagirmalar', { ilac_id: ilac.id, parti_no: 'YOK' })).status, 404);
  const g = (await admin.post('/api/kalite/geri-cagirmalar', { ilac_id: ilac.id, parti_no: 'GC-1', stoktan_cek: true, aciklama: 'TİTCK' })).data;
  assert.equal(g.stoktan_cekilen, 7);
  assert.equal(g.etkilenen_satis, 1);
  assert.equal(stok(ilac.id), 0);
  assert.equal((await admin.get('/api/kalite/geri-cagirmalar')).data.length, 1);
});

test('imha: seçilen partiden stok düşer, tutanak PDF üretilir', async () => {
  const ilac = (await admin.post('/api/ilaclar', { ad: 'Miadı Geçmiş Krem', satis_fiyati: 40, alis_fiyati: 25, stok: 6, parti_no: 'IM-1', skt: '2020-01-01' })).data;
  const aday = (await admin.get('/api/kalite/imha-adaylari')).data.find((a) => a.ilac_id === ilac.id);
  assert.equal(aday.skt_gecmis, 1);
  assert.equal((await admin.post('/api/kalite/imhalar', { kalemler: [{ parti_id: aday.parti_id, adet: 99 }], yontem: 'lisansli_firma' })).status, 400);
  assert.equal((await admin.post('/api/kalite/imhalar', { kalemler: [{ parti_id: aday.parti_id, adet: 1 }], yontem: 'yak' })).status, 400);
  const im = (await admin.post('/api/kalite/imhalar', { kalemler: [{ parti_id: aday.parti_id, adet: 4 }], yontem: 'lisansli_firma', tanik: 'Ayşe Demir' })).data;
  assert.equal(im.toplam_adet, 4);
  assert.equal(im.toplam_maliyet, 100);
  assert.equal(stok(ilac.id), 2);
  const tut = (await admin.get(`/api/kalite/imhalar/${im.id}/tutanak`)).data;
  assert.equal(tut.kalemler[0].parti_no, 'IM-1');
  const pdf = await fetch(sunucu.base + `/api/kalite/imhalar/${im.id}/tutanak?format=pdf`, { headers: { Cookie: admin.cerez() } });
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
});
