const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { karekodCoz } = require('../server/karekod');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

const GS = '\x1d';

test('GS ayiricili karekod cozulur', () => {
  const k = karekodCoz(`010869950401001221SERI123${GS}17270301${GS}10LOT2026A`);
  assert.deepEqual(
    { gtin: k.gtin, barkod: k.barkod, seri_no: k.seri_no, skt: k.skt, parti_no: k.parti_no },
    { gtin: '08699504010012', barkod: '8699504010012', seri_no: 'SERI123', skt: '2027-03-01', parti_no: 'LOT2026A' }
  );
});

test('GS kaybolmus ve sembol on ekli karekod geri izlemeyle cozulur', () => {
  const k = karekodCoz(']d2010869950401001221SN17A1727123110L17');
  assert.equal(k.seri_no, 'SN17A');
  assert.equal(k.skt, '2027-12-31');
  assert.equal(k.parti_no, 'L17');
});

test('parantezli insan okunur bicim ve "00" gunu ay sonu olarak cozulur', () => {
  const k = karekodCoz('(01)08699504010012(21)SN1(17)280200(10)L1');
  assert.equal(k.skt, '2028-02-29');
  assert.equal(k.parti_no, 'L1');
});

test('gecersiz veriler reddedilir', () => {
  assert.equal(karekodCoz('8699504010012'), null);
  assert.equal(karekodCoz('0186995040100'), null);
  assert.equal(karekodCoz('01086995040100121799130110L1'), null, 'gecersiz ay');
  assert.equal(karekodCoz(''), null);
});

let sunucu;
let kasiyer;
before(async () => {
  sunucu = await sunucuBaslat();
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('karekod endpointi urunu bulur ve SKT gecmisini isaretler', async () => {
  const gecerli = await kasiyer.get('/api/ilaclar/karekod?kod=' + encodeURIComponent(`010869950401001221X1${GS}17301231${GS}10L1`));
  assert.equal(gecerli.status, 200);
  assert.equal(gecerli.data.ilac.ad, 'Parol 500mg 20 Tablet');
  assert.equal(gecerli.data.skt_gecmis, false);

  const gecmis = await kasiyer.get('/api/ilaclar/karekod?kod=' + encodeURIComponent('010869950401001217200101'));
  assert.equal(gecmis.data.skt_gecmis, true);

  const bilinmeyen = await kasiyer.get('/api/ilaclar/karekod?kod=' + encodeURIComponent('010000000000000017301231'));
  assert.equal(bilinmeyen.status, 200);
  assert.equal(bilinmeyen.data.ilac, null);

  const bozuk = await kasiyer.get('/api/ilaclar/karekod?kod=abc');
  assert.equal(bozuk.status, 400);
});
