// Belgelerde yazili varsayilan sifreler, sifre degistirilene kadar yalnizca sunucu bilgisayarindan kullanilabilir.
process.env.TRUST_PROXY = '1';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat } = require('./helpers');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(() => sunucu.kapat());

function giris(kullanici_adi, sifre, uzakAdres) {
  const headers = { 'Content-Type': 'application/json' };
  if (uzakAdres) headers['X-Forwarded-For'] = uzakAdres;
  return fetch(sunucu.base + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ kullanici_adi, sifre }) });
}

test('varsayilan sifreyle agdaki baska bir cihazdan giris reddedilir', async () => {
  for (const [kullanici, sifre] of [['admin', 'admin123'], ['eczaci', 'eczaci123'], ['kasiyer', 'kasiyer123']]) {
    const res = await giris(kullanici, sifre, '192.168.1.50');
    assert.equal(res.status, 403, kullanici);
    assert.equal(res.headers.get('set-cookie'), null, 'oturum acilmamali');
  }
});

test('uzaktan yanlis sifre hala 401 doner', async () => {
  assert.equal((await giris('admin', 'yanlis', '192.168.1.50')).status, 401);
});

test('varsayilan sifreyle sunucu bilgisayarindan giris yapilir', async () => {
  assert.equal((await giris('admin', 'admin123')).status, 200);
});
