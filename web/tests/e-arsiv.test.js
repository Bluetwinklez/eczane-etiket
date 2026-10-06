const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');
const { faturaCoz } = require('../server/eFatura');
const { satirlariHesapla } = require('../server/eArsiv');

let sunucu;
let admin;
let kasiyer;
let ilac;
let krem;

const AYAR = {
  unvan: 'Test Eczanesi',
  vkn: '12345678901',
  eczaci_adi: 'Ayşe Nur Demir',
  vergi_dairesi: 'Kadıköy',
  adres: 'Moda Cad. No: 1',
  ilce: 'Kadıköy',
  il: 'İstanbul',
  seri: 'ECZ'
};

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  ilac = (await admin.post('/api/ilaclar', { ad: 'Fatura Ilaci <Tb>', barkod: '8690000000011', satis_fiyati: 110, stok: 50 })).data.id;
  krem = (await admin.post('/api/ilaclar', { ad: 'Fatura Kremi', barkod: '8690000000028', satis_fiyati: 120, stok: 50, urun_tipi: 'dermokozmetik' })).data.id;
});
after(() => sunucu.kapat());

test('KDV dahil satis tutari satirlara dagitilir, kurus farki kalmaz', () => {
  const satirlar = satirlariHesapla(
    [
      { ilac_adi: 'A', adet: 3, birim_fiyat: 33.33, urun_tipi: 'ilac' },
      { ilac_adi: 'B', adet: 1, birim_fiyat: 20, urun_tipi: 'dermokozmetik' }
    ],
    100,
    { ilac: 10, dermokozmetik: 20, diger: 20 }
  );
  const toplam = satirlar.reduce((t, s) => t + s.tutar + s.kdv, 0);
  assert.equal(Math.round(toplam * 100) / 100, 100);
  assert.equal(satirlar[0].kdv_orani, 10);
  assert.equal(satirlar[1].kdv_orani, 20);
  assert.ok(satirlar.every((s) => s.iskonto > 0), 'indirim satirlara dagitilmali');
});

test('fatura bilgileri girilmeden fatura kesilemez; ayarlar dogrulanir', async () => {
  const satis = (await admin.post('/api/satislar', { kalemler: [{ ilac_id: ilac, adet: 1 }] })).data;
  const r = await admin.post(`/api/e-arsiv/satis/${satis.id}`, {});
  assert.equal(r.status, 400);
  assert.match(r.data.error, /fatura bilgilerini/);
  assert.equal((await admin.put('/api/e-arsiv/ayarlar', { seri: 'AB' })).status, 400);
  assert.equal((await admin.put('/api/e-arsiv/ayarlar', { vkn: '123' })).status, 400);
  assert.equal((await kasiyer.put('/api/e-arsiv/ayarlar', AYAR)).status, 403);
  const a = await admin.put('/api/e-arsiv/ayarlar', AYAR);
  assert.equal(a.status, 200);
  assert.equal(a.data.eksik, null);
});

test('satistan UBL-TR e-Arsiv XML olusur; kendi ayristiricimiz ayni tutarlari okur', async () => {
  const musteri = (await admin.post('/api/musteriler', { ad_soyad: 'Mehmet Ali Kaya', tc_no: '10000000146', telefon: '05551112233' })).data.id;
  const satis = (
    await admin.post('/api/satislar', { musteri_id: musteri, indirim_yuzdesi: 10, kalemler: [{ ilac_id: ilac, adet: 2 }, { ilac_id: krem, adet: 1 }] })
  ).data;
  const r = await admin.post(`/api/e-arsiv/satis/${satis.id}`, {});
  assert.equal(r.status, 201);
  assert.match(r.data.fatura_no, /^ECZ\d{4}000000001$/);
  assert.equal(r.data.toplam, satis.toplam_tutar);
  assert.equal(r.data.alici_kimlik, '10000000146');
  assert.equal(r.data.xml, undefined, 'ozet yanitta XML olmamali');

  const x = await fetch(`${sunucu.base}/api/e-arsiv/satis/${satis.id}/xml`, { headers: { cookie: admin.cerez() } });
  assert.match(x.headers.get('content-disposition'), new RegExp(`${r.data.fatura_no}\\.xml`));
  const xml = await x.text();
  assert.match(xml, /<cbc:ProfileID>EARSIVFATURA<\/cbc:ProfileID>/);
  assert.match(xml, /<cbc:ID schemeID="TCKN">12345678901<\/cbc:ID>/);
  assert.match(xml, /<cbc:FirstName>Mehmet Ali<\/cbc:FirstName><cbc:FamilyName>Kaya<\/cbc:FamilyName>/);
  assert.match(xml, /Fatura Ilaci &lt;Tb&gt;/);
  assert.match(xml, /<cbc:Percent>10<\/cbc:Percent>[\s\S]*<cbc:Percent>20<\/cbc:Percent>/);

  const coz = faturaCoz(xml);
  assert.equal(coz.fatura.no, r.data.fatura_no);
  assert.equal(coz.fatura.senaryo, 'EARSIVFATURA');
  assert.equal(coz.fatura.tedarikci.vkn, '12345678901');
  assert.equal(coz.fatura.odenecek, satis.toplam_tutar);
  assert.equal(coz.satirlar.length, 2);
  assert.equal(coz.satirlar[0].barkod, '8690000000011');
  assert.deepEqual(coz.uyarilar, []);

  // Ayni satisa ikinci kez fatura kesilmez, ayni fatura doner
  const tekrar = await admin.post(`/api/e-arsiv/satis/${satis.id}`, {});
  assert.equal(tekrar.status, 200);
  assert.equal(tekrar.data.fatura_no, r.data.fatura_no);
});

test('kimligi olmayan musteriye nihai tuketici olarak kesilir, numara artar; liste ve sube yetkisi', async () => {
  const satis = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: krem, adet: 1 }] })).data;
  const r = await kasiyer.post(`/api/e-arsiv/satis/${satis.id}`, {});
  assert.equal(r.status, 201);
  assert.equal(r.data.alici_kimlik, '11111111111');
  assert.match(r.data.fatura_no, /000000002$/);
  assert.equal((await kasiyer.get('/api/e-arsiv')).status, 403);
  const liste = (await admin.get('/api/e-arsiv')).data;
  assert.equal(liste.length, 2);
  assert.equal(liste[0].xml, undefined);

  const digerSube = db.prepare("INSERT INTO subeler (ad) VALUES ('Diger Sube')").run().lastInsertRowid;
  const yabanci = db.prepare("INSERT INTO satislar (sube_id, toplam_tutar) VALUES (?, 10)").run(digerSube).lastInsertRowid;
  assert.equal((await kasiyer.post(`/api/e-arsiv/satis/${yabanci}`, {})).status, 403);
  assert.equal((await admin.post('/api/e-arsiv/satis/999999', {})).status, 404);
});
