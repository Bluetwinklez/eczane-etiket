const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'eczanem-yedek-'));
process.env.ECZANEM_YEDEK_DIZINI = dizin;
process.env.ECZANEM_YEDEK_SAKLA = '3';

const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { otomatikYedekAl } = require('../server/yedek');

let sunucu;
let admin;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => {
  fs.rmSync(dizin, { recursive: true, force: true });
  return sunucu.kapat();
});

test('ilk otomatik yedek alinir, 24 saat dolmadan tekrar alinmaz', () => {
  const ilk = otomatikYedekAl();
  assert.equal(ilk.alindi, true);
  const yedek = JSON.parse(fs.readFileSync(path.join(dizin, ilk.dosya), 'utf8'));
  assert.ok(yedek.tablolar.ilaclar.length > 0);
  assert.equal(otomatikYedekAl().alindi, false);
});

test('en fazla N yedek saklanir, eskiler silinir', async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 1100)); // dosya adi saniye hassasiyetinde
    otomatikYedekAl({ zorla: true });
  }
  const liste = (await admin.get('/api/yedekleme/otomatik')).data;
  assert.equal(liste.length, 3);
  assert.equal(fs.readdirSync(dizin).filter((f) => f.endsWith('.json')).length, 3);
});

test('indirme yalnizca gecerli dosya adlariyla; kasiyer erisemez', async () => {
  const liste = (await admin.get('/api/yedekleme/otomatik')).data;
  const indir = await admin.get(`/api/yedekleme/otomatik/${liste[0].dosya}`);
  assert.equal(indir.status, 200);
  assert.ok(indir.data.tablolar);
  assert.equal((await admin.get('/api/yedekleme/otomatik/..%2F..%2Fpackage.json')).status, 404);
  assert.equal((await admin.get('/api/yedekleme/otomatik/eczanem-otomatik-2020-01-01-000000.json')).status, 404);
  assert.equal((await kasiyer.get('/api/yedekleme/otomatik')).status, 403);
  assert.equal((await admin.post('/api/yedekleme/otomatik/simdi', {})).status, 201);
});
