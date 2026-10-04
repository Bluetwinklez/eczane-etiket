const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let eczaci;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  eczaci = await girisliIstemci(sunucu.base, 'eczaci');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('ekran kilidi şifreyle açılır; yanlış şifre 400 döner, oturum düşmez', async () => {
  const yanlis = await kasiyer.post('/api/auth/kilit-ac', { sifre: 'yanlis' });
  assert.equal(yanlis.status, 400);
  assert.equal((await kasiyer.get('/api/auth/me')).status, 200);
  assert.equal((await kasiyer.post('/api/auth/kilit-ac', { sifre: 'kasiyerYeni2026' })).status, 200);
});

test('duyurular: yönetici/eczacı yazar, herkes okur; süresi dolan görünmez', async () => {
  assert.equal((await kasiyer.post('/api/sistem/duyurular', { baslik: 'X' })).status, 403);
  assert.equal((await eczaci.post('/api/sistem/duyurular', { baslik: '' })).status, 400);
  const d = (await eczaci.post('/api/sistem/duyurular', { baslik: 'Soğuk zincir kontrolü', metin: 'Her sabah 09:00', onemli: true })).data;
  await admin.post('/api/sistem/duyurular', { baslik: 'Eski duyuru', bitis: '2020-01-01' });
  const genel = (await admin.post('/api/sistem/duyurular', { baslik: 'Tüm şubelere', tum_subeler: true })).data;
  assert.equal(genel.sube_id, null);
  const liste = (await kasiyer.get('/api/sistem/duyurular')).data;
  assert.equal(liste[0].id, d.id);
  assert.ok(!liste.some((x) => x.baslik === 'Eski duyuru'));
  assert.ok(liste.some((x) => x.id === genel.id));
  assert.equal((await eczaci.del('/api/sistem/duyurular/' + genel.id)).status, 403);
  assert.equal((await eczaci.del('/api/sistem/duyurular/' + d.id)).status, 204);
});

test('sistem durumu yalnızca yöneticiye açık ve tablo sayımlarını verir', async () => {
  assert.equal((await eczaci.get('/api/sistem/durum')).status, 403);
  const d = (await admin.get('/api/sistem/durum')).data;
  assert.equal(d.surum, require('../package.json').version);
  assert.ok(d.veritabani.boyut_bayt > 0);
  assert.ok(d.tablolar.find((t) => t.tablo === 'ilaclar').kayit > 0);
  assert.ok(d.aktif_oturum >= 1);
});

test('müşteri ve ilaç listesi CSV olarak dışa aktarılır (Türkçe başlık, BOM)', async () => {
  assert.equal((await kasiyer.get('/api/musteriler/disa-aktar')).status, 403);
  const m = await admin.get('/api/musteriler/disa-aktar');
  assert.match(m.headers.get('content-type'), /text\/csv/);
  assert.match(m.data, /Ad Soyad;Telefon;E-posta;Doğum Tarihi/);
  assert.match(m.data, /Ahmet Yılmaz/);
  const i = await admin.get('/api/ilaclar/disa-aktar');
  assert.match(i.data, /Ad;Barkod;Kategori;Üretici/);
  assert.match(i.data, /Parol 500mg 20 Tablet/);
});
