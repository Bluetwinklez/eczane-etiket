const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, istemci, girisliIstemci, DEMO } = require('./helpers');
const { db } = require('../server/db');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(() => sunucu.kapat());

test('demo hesap ilk giriste sifre degistirmeden API kullanamaz', async () => {
  const c = istemci(sunucu.base);
  const giris = await c.girisYap(...DEMO.eczaci);
  assert.equal(giris.status, 200);
  assert.equal(giris.data.user.sifre_degistirilmeli, 1);

  assert.equal((await c.get('/api/auth/me')).status, 200, '/me izinli olmali');
  const engel = await c.get('/api/ilaclar');
  assert.equal(engel.status, 403);
  assert.equal(engel.data.kod, 'SIFRE_DEGISTIRILMELI');
});

test('sifre degisimi kurallari uygulanir ve sonra erisim acilir', async () => {
  const c = istemci(sunucu.base);
  await c.girisYap(...DEMO.kasiyer);

  const yanlisMevcut = await c.post('/api/auth/sifre-degistir', { mevcut_sifre: 'x', yeni_sifre: 'Guclu12345' });
  assert.equal(yanlisMevcut.status, 400);

  const kisa = await c.post('/api/auth/sifre-degistir', { mevcut_sifre: 'kasiyer123', yeni_sifre: 'a1' });
  assert.equal(kisa.status, 400);

  const rakamsiz = await c.post('/api/auth/sifre-degistir', { mevcut_sifre: 'kasiyer123', yeni_sifre: 'sadeceharf' });
  assert.equal(rakamsiz.status, 400);

  const ok = await c.post('/api/auth/sifre-degistir', { mevcut_sifre: 'kasiyer123', yeni_sifre: 'Guclu12345' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.sifre_degistirilmeli, 0);
  assert.equal((await c.get('/api/ilaclar')).status, 200);

  assert.equal((await istemci(sunucu.base).girisYap('kasiyer', 'kasiyer123')).status, 401, 'eski sifre gecersiz');
  assert.equal((await istemci(sunucu.base).girisYap('kasiyer', 'Guclu12345')).status, 200);
});

test('art arda basarisiz girisler gecici olarak kilitlenir', async () => {
  const c = istemci(sunucu.base);
  for (let i = 0; i < 5; i++) {
    assert.equal((await c.girisYap('saldirgan', 'yanlis')).status, 401);
  }
  const kilit = await c.girisYap('saldirgan', 'yanlis');
  assert.equal(kilit.status, 429);
  assert.ok(Number(kilit.headers.get('retry-after')) > 0);
});

test('oturumlar veritabaninda saklanir ve cikista silinir', async () => {
  const c = await girisliIstemci(sunucu.base, 'admin');
  const sayiOnce = db.prepare('SELECT COUNT(*) AS c FROM oturumlar').get().c;
  assert.ok(sayiOnce > 0);

  const cikis = await c.post('/api/auth/logout');
  assert.match(cikis.headers.get('set-cookie') || '', /eczanem\.sid=;/);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM oturumlar').get().c, sayiOnce - 1);
});

test('yoneticinin sifirladigi sifre ilk giriste tekrar degistirilmeli', async () => {
  const admin = await girisliIstemci(sunucu.base, 'admin');
  const yeni = await admin.post('/api/kullanicilar', {
    kullanici_adi: 'yeniuser',
    sifre: 'Baslangic123',
    ad_soyad: 'Yeni Kullanici',
    rol: 'kasiyer',
    sube_id: 1
  });
  assert.equal(yeni.status, 201);
  assert.equal(yeni.data.sifre_degistirilmeli, 1);

  const zayif = await admin.post('/api/kullanicilar', {
    kullanici_adi: 'zayif',
    sifre: '123',
    ad_soyad: 'Zayif',
    rol: 'kasiyer'
  });
  assert.equal(zayif.status, 400);

  const gecersizPut = await admin.put(`/api/kullanicilar/${yeni.data.id}`, {
    ad_soyad: 'Degismemeli',
    rol: 'kasiyer',
    sifre: 'x'
  });
  assert.equal(gecersizPut.status, 400);
  const kayit = (await admin.get(`/api/kullanicilar/${yeni.data.id}`)).data;
  assert.equal(kayit.ad_soyad, 'Yeni Kullanici', 'gecersiz sifreli istek diger alanlari degistirmemeli');
});
