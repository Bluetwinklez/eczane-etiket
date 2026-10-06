const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const bildirim = require('../server/bildirim');

let sunucu;
let admin;
let siparisId;
let epostasizId;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  const ted = (await admin.post('/api/tedarikciler', { firma_adi: 'Test Deposu', email: 'siparis@depo.test' })).data.id;
  const ted2 = (await admin.post('/api/tedarikciler', { firma_adi: 'Epostasiz Depo' })).data.id;
  const ilac = (await admin.post('/api/ilaclar', { ad: 'Siparis Ilaci; 500 mg', barkod: '8699000000017', satis_fiyati: 20, alis_fiyati: 12 })).data.id;
  siparisId = (await admin.post('/api/siparisler', { tedarikci_id: ted, notlar: 'Acil', kalemler: [{ ilac_id: ilac, istenen_adet: 4 }] })).data.id;
  epostasizId = (await admin.post('/api/siparisler', { tedarikci_id: ted2, kalemler: [{ ilac_id: ilac, istenen_adet: 1 }] })).data.id;
});
after(() => sunucu.kapat());

test('depo dosyasi barkod ve adet iceren CSV olarak iner', async () => {
  const r = await fetch(`${sunucu.base}/api/siparisler/${siparisId}/csv`, { headers: { cookie: admin.cerez() } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  const metin = await r.text();
  const satirlar = metin.replace(/^﻿/, '').split('\n');
  assert.equal(satirlar[0], 'Barkod;Ürün;Adet;Birim Fiyat');
  assert.equal(satirlar[1], '8699000000017;Siparis Ilaci, 500 mg;4;12');
});

test('SMTP yokken e-posta taslagi (mailto) doner, durum degismez', async () => {
  const r = await admin.post(`/api/siparisler/${siparisId}/eposta`, {});
  assert.equal(r.status, 200);
  assert.equal(r.data.durum, 'simule');
  assert.equal(r.data.adres, 'siparis@depo.test');
  assert.match(r.data.mailto, /^mailto:siparis%40depo\.test\?subject=/);
  assert.match(r.data.metin, /8699000000017 {2}Siparis Ilaci; 500 mg {2}x 4/);
  assert.match(r.data.metin, /Not: Acil/);
  assert.equal((await admin.get(`/api/siparisler/${siparisId}`)).data.durum, 'beklemede');
});

test('e-postasi olmayan tedarikci icin adres istenir; gecersiz adres reddedilir', async () => {
  assert.equal((await admin.post(`/api/siparisler/${epostasizId}/eposta`, {})).status, 400);
  assert.equal((await admin.post(`/api/siparisler/${epostasizId}/eposta`, { adres: 'yanlis' })).status, 400);
  const r = await admin.post(`/api/siparisler/${epostasizId}/eposta`, { adres: 'diger@depo.test' });
  assert.equal(r.data.adres, 'diger@depo.test');
  assert.equal((await admin.get(`/api/siparisler/${epostasizId}`)).data.tedarikci_email, null);
});

test('SMTP varsa CSV ekiyle gonderilir ve siparis gonderildi olur', async () => {
  const eski = { s: bildirim.smtpYapilandirilmisMi, t: bildirim.getTransporter };
  const giden = [];
  bildirim.smtpYapilandirilmisMi = () => true;
  bildirim.getTransporter = () => ({ sendMail: async (m) => giden.push(m) });
  try {
    const r = await admin.post(`/api/siparisler/${siparisId}/eposta`, {});
    assert.equal(r.data.durum, 'gonderildi');
    assert.equal(giden.length, 1);
    assert.equal(giden[0].to, 'siparis@depo.test');
    assert.equal(giden[0].attachments[0].filename, `siparis-${siparisId}.csv`);
    assert.match(giden[0].attachments[0].content, /8699000000017;.*;4;/);
    assert.equal((await admin.get(`/api/siparisler/${siparisId}`)).data.durum, 'gonderildi');
  } finally {
    Object.assign(bildirim, { smtpYapilandirilmisMi: eski.s, getTransporter: eski.t });
  }
});
