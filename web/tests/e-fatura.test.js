const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { faturaCoz, xmlAgac } = require('../server/eFatura');

const XML = fs.readFileSync(path.join(__dirname, 'ornekler', 'e-fatura-ornek.xml'), 'utf8');
let sunucu;
let admin;
let kasiyer;
before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

const yukle = (govde, istemci = admin) =>
  fetch(sunucu.base + '/api/mal-kabul/e-fatura', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Cookie: istemci.cerez() }, body: govde });

test('UBL-TR ayrıştırma: başlık, tedarikçi VKN, satırlar, iskonto, KDV, parti/SKT, MF', () => {
  const { fatura, satirlar, uyarilar } = faturaCoz(XML);
  assert.equal(fatura.no, 'DEP2026000012345');
  assert.equal(fatura.tarih, '2026-10-03');
  assert.equal(fatura.tip, 'SATIS');
  assert.deepEqual(fatura.tedarikci, { ad: 'Selçuk Ecza Deposu Tic. A.Ş.', vkn: '4560012345' });
  assert.equal(fatura.odenecek, 521.4);
  assert.equal(satirlar.length, 3, 'bedelsiz satır ücretli satıra MF olarak eklenir');
  const parol = satirlar[0];
  assert.equal(parol.barkod, '8699504010012');
  assert.equal(parol.adet, 10);
  assert.equal(parol.mf, 1);
  assert.equal(parol.birim_fiyat_kdv_haric, 15);
  assert.equal(parol.birim_fiyat_kdv_dahil, 16.5);
  assert.equal(parol.iskonto, 5);
  assert.equal(parol.parti_no, 'L2610A');
  assert.equal(parol.skt, '2028-06-30');
  assert.equal(satirlar[1].ad, 'Nurofen 400mg 24 Tablet & Ağrı', 'XML varlıkları çözülür');
  assert.equal(satirlar[1].mf, 2, 'satır notundaki MF okunur');
  assert.equal(satirlar[2].ad, 'YENİ ÜRÜN <ÖRNEK> 5 MG 30 TABLET', 'CDATA');
  assert.deepEqual(uyarilar, []);
});

test('güvenlik ve hatalı belgeler', () => {
  assert.throws(() => xmlAgac('<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>'), /DOCTYPE/);
  assert.throws(() => faturaCoz('<root><a/></root>'), /Invoice/);
  const iade = faturaCoz(XML.replace('<cbc:InvoiceTypeCode>SATIS', '<cbc:InvoiceTypeCode>IADE'));
  assert.ok(iade.uyarilar.some((u) => /iade faturası/.test(u)));
  const fark = faturaCoz(XML.replace('521.40</cbc:PayableAmount>', '600.00</cbc:PayableAmount>'));
  assert.ok(fark.uyarilar.some((u) => /farklı/.test(u)));
});

test('önizleme uç noktası: katalog eşleşmesi, tedarikçi adla bulunur, yetki ve bozuk dosya', async () => {
  assert.equal((await yukle(XML, kasiyer)).status, 403);
  assert.equal((await yukle('bozuk')).status, 400);
  const y = await yukle(XML);
  assert.equal(y.status, 200);
  const v = await y.json();
  assert.equal(v.ozet.satir, 3);
  assert.equal(v.ozet.eslesen, 2);
  assert.equal(v.satirlar[0].eslesme, 'barkod');
  assert.equal(v.satirlar[2].ilac_id, null);
  assert.equal(v.fatura.tedarikci.eslesen.firma_adi, 'Selçuk Ecza Deposu');
  assert.equal(v.fatura.tedarikci.eslesen.vkn_ile, false);
  assert.equal(v.mukerrer, null);
});

test('mal kabul kaydı vergi numarasını tedarikçiye işler; aynı fatura ikinci kez uyarı verir; ZIP içindeki XML okunur', async () => {
  const v = await (await yukle(XML)).json();
  const tedId = v.fatura.tedarikci.eslesen.id;
  const kalemler = v.satirlar.filter((s) => s.ilac_id).map((s) => ({ ilac_id: s.ilac_id, adet: s.adet, mf: s.mf, alis_fiyati: s.birim_fiyat_kdv_dahil, parti_no: s.parti_no, skt: s.skt }));
  const mk = await admin.post('/api/mal-kabul', { tedarikci_id: tedId, fatura_no: v.fatura.no, fatura_tarihi: v.fatura.tarih, tedarikci_vkn: v.fatura.tedarikci.vkn, kalemler });
  assert.equal(mk.status, 201);

  const ikinci = await (await yukle(XML)).json();
  assert.equal(ikinci.fatura.tedarikci.eslesen.vkn_ile, true, 'artık vergi numarasıyla eşleşir');
  assert.equal(ikinci.mukerrer, mk.data.id);
  assert.ok(ikinci.uyarilar[0].includes('daha önce'));

  // Tek dosyali ZIP (stored)
  const veri = Buffer.from(XML);
  const ad = Buffer.from('fatura.xml');
  const yerel = Buffer.alloc(30);
  yerel.writeUInt32LE(0x04034b50, 0);
  yerel.writeUInt32LE(zlib.crc32 ? zlib.crc32(veri) : 0, 14);
  yerel.writeUInt32LE(veri.length, 18);
  yerel.writeUInt32LE(veri.length, 22);
  yerel.writeUInt16LE(ad.length, 26);
  const dizin = Buffer.alloc(46);
  dizin.writeUInt32LE(0x02014b50, 0);
  dizin.writeUInt32LE(veri.length, 20);
  dizin.writeUInt32LE(veri.length, 24);
  dizin.writeUInt16LE(ad.length, 28);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0);
  son.writeUInt16LE(1, 8);
  son.writeUInt16LE(1, 10);
  son.writeUInt32LE(46 + ad.length, 12);
  son.writeUInt32LE(30 + ad.length + veri.length, 16);
  const zip = Buffer.concat([yerel, ad, veri, dizin, ad, son]);
  const z = await yukle(zip);
  assert.equal(z.status, 200);
  assert.equal((await z.json()).fatura.no, 'DEP2026000012345');
});
