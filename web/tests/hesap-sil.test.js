const test = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci, istemci } = require('./helpers');
const { db } = require('../server/db');
test('self deletion validates password, preserves records and revokes sessions', async () => {
 const s = await sunucuBaslat();
 try {
  const admin = await girisliIstemci(s.base, 'admin');
  const c = await girisliIstemci(s.base, 'kasiyer');
  const me = await c.get('/api/auth/me');
  const id = me.data.user.id;
  const other = istemci(s.base);
  await other.girisYap('kasiyer', 'kasiyerYeni2026');
  assert.equal((await c.post('/api/auth/hesabi-sil', { sifre: 'wrong' })).status, 400);
  assert.ok(db.prepare('SELECT id FROM kullanicilar WHERE id=?').get(id));
  db.prepare("INSERT INTO duyurular (baslik,kullanici_id) VALUES ('preserved',?)").run(id);
  assert.equal((await c.post('/api/auth/hesabi-sil', { sifre: 'kasiyerYeni2026' })).status, 204);
  assert.equal(db.prepare('SELECT id FROM kullanicilar WHERE id=?').get(id), undefined);
  assert.equal(db.prepare("SELECT kullanici_id FROM duyurular WHERE baslik='preserved'").get().kullanici_id, null);
  assert.equal((await other.get('/api/auth/me')).status, 401);
  assert.equal((await admin.post('/api/auth/hesabi-sil', { sifre: 'adminYeni2026' })).status, 409);
  assert.equal((await istemci(s.base).post('/api/auth/hesabi-sil', { sifre: 'x' })).status, 401);
 } finally { await s.kapat(); }
});
