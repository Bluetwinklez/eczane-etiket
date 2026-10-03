const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, istemci, girisliIstemci } = require('./helpers');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(() => sunucu.kapat());

test('dogru bilgilerle giris yapilir ve /me kullaniciyi dondurur', async () => {
  const c = await girisliIstemci(sunucu.base, 'admin');
  const me = await c.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.kullanici_adi, 'admin');
  assert.equal(me.data.user.sifre_hash, undefined, 'sifre hash disari sizmamali');
});

test('yanlis sifre 401 doner', async () => {
  const c = istemci(sunucu.base);
  const res = await c.girisYap('admin', 'yanlis');
  assert.equal(res.status, 401);
});

test('oturum olmadan korumali endpoint 401 doner', async () => {
  const c = istemci(sunucu.base);
  const res = await c.get('/api/ilaclar');
  assert.equal(res.status, 401);
});

test('cikis yapildiktan sonra oturum gecersiz olur', async () => {
  const c = await girisliIstemci(sunucu.base, 'eczaci');
  assert.equal((await c.post('/api/auth/logout')).status, 204);
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('kasiyer admin-only endpointlere erisemez', async () => {
  const c = await girisliIstemci(sunucu.base, 'kasiyer');
  assert.equal((await c.get('/api/kullanicilar')).status, 403);
  assert.equal((await c.get('/api/raporlar/satis')).status, 403);
  assert.equal((await c.get('/api/yedekleme/export')).status, 403);
});
