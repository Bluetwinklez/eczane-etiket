const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Demo modu modul yuklenmeden once acilir
process.env.ECZAM_DEMO = '1';
process.env.ECZAM_DEMO_KULLANICI = 'demo';
process.env.ECZAM_DEMO_SIFRE = 'demo1234';
const { sunucuBaslat, istemci } = require('./helpers');
const { db, verifyPassword } = require('../server/db');
const { demoHazirla } = require('../server/demo');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(() => {
  delete process.env.ECZAM_DEMO;
  sunucu.kapat();
});

test('demo hazirligi: demo hesabi, ornek satislar ve varsayilan sifrelerin kapatilmasi', async () => {
  const sonuc = demoHazirla();
  assert.ok(sonuc.satis > 50, 'ornek satis eklenmeli');
  assert.equal(demoHazirla().satis, 0, 'ikinci acilista yeniden satis eklenmez');

  const demo = db.prepare("SELECT * FROM kullanicilar WHERE kullanici_adi = 'demo'").get();
  assert.equal(demo.rol, 'eczaci');
  assert.equal(demo.sifre_degistirilmeli, 0);
  assert.ok(verifyPassword('demo1234', demo.sifre_salt, demo.sifre_hash));
  const admin = db.prepare("SELECT * FROM kullanicilar WHERE kullanici_adi = 'admin'").get();
  assert.ok(!verifyPassword('admin123', admin.sifre_salt, admin.sifre_hash), 'herkese acik sunucuda varsayilan admin sifresi calismamali');

  const h = await (await fetch(`${sunucu.base}/api/health`)).json();
  assert.deepEqual(h.demo, { kullanici: 'demo', sifre: 'demo1234' });
});

test('demo hesabiyla giris yapilir, sifresi degistirilemez', async () => {
  const c = istemci(sunucu.base);
  const g = await c.post('/api/auth/login', { kullanici_adi: 'demo', sifre: 'demo1234' });
  assert.equal(g.status, 200);
  assert.ok(!g.data.user.sifre_degistirilmeli);
  const d = await c.post('/api/auth/sifre-degistir', { mevcut_sifre: 'demo1234', yeni_sifre: 'baskaSifre99' });
  assert.equal(d.status, 403);
  const ozet = await c.get('/api/mobil/ozet?donem=gun');
  assert.equal(ozet.status, 200);
});
