const os = require('os');
const fs = require('fs');
const path = require('path');
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'eczam-bulut-'));
process.env.ECZANEM_YEDEK_DIZINI = path.join(gecici, 'yerel');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const B = require('../server/bulutYedek');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
  fs.rmSync(gecici, { recursive: true, force: true });
});

test('şifreleme: doğru şifreyle açılır, yanlış şifre anlaşılır hata verir', () => {
  const s = B.sifrele('{"a":1}', 'gizli-sifre-123');
  assert.equal(s.subarray(0, 9).toString(), 'ECZAMYDK1');
  assert.ok(!s.toString('latin1').includes('"a"'), 'içerik düz metin olarak görünmez');
  assert.equal(B.yedegiAc(s, 'gizli-sifre-123'), '{"a":1}');
  assert.throws(() => B.yedegiAc(s, 'yanlis-sifre'), /Şifre yanlış/);
  assert.throws(() => B.yedegiAc(s, ''), /şifreli/);
  assert.equal(B.yedegiAc(require('zlib').gzipSync('{"b":2}')), '{"b":2}');
  assert.equal(B.yedegiAc(Buffer.from('{"c":3}')), '{"c":3}');
});

test('bulut klasörüne şifreli günlük yedek ve şifreli dosyadan geri yükleme', async () => {
  const admin = await girisliIstemci(sunucu.base, 'admin');
  const eczaci = await girisliIstemci(sunucu.base, 'eczaci');
  const klasor = path.join(gecici, 'OneDrive', 'Eczam Yedekleri');

  assert.equal((await eczaci.get('/api/yedekleme/bulut')).status, 403);
  assert.equal((await admin.put('/api/yedekleme/bulut', { klasor: 'goreli/yol' })).status, 400);
  assert.equal((await admin.put('/api/yedekleme/bulut', { sifre: 'kisa' })).status, 400);
  assert.equal((await admin.put('/api/yedekleme/bulut', { aktif: true, klasor: '' })).status, 400);
  const a = await admin.put('/api/yedekleme/bulut', { aktif: true, klasor, sifre: 'Eczane-Yedek-2026', sakla: 2 });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(a.data.sifre_var, true);
  assert.equal(a.data.sifre, undefined, 'şifre dışarı verilmez');

  // Yedek al: yerel kopya + bulut klasorunde sifreli kopya; en fazla 2 saklanir
  for (let i = 0; i < 3; i++) {
    const r = (await admin.post('/api/yedekleme/otomatik/simdi', {})).data;
    assert.equal(r.bulut.durum, 'tamam');
    assert.equal(r.bulut.sifreli, true);
    await new Promise((t) => setTimeout(t, 1100));
  }
  const g = (await admin.get('/api/yedekleme/bulut')).data;
  assert.equal(g.dosyalar.length, 2);
  assert.match(g.dosyalar[0].dosya, /\.eczam$/);
  assert.equal(g.son.durum, 'tamam');

  // Veriyi degistir, sifreli yedekten geri yukle
  const once = (await admin.get('/api/musteriler')).data.length;
  await admin.post('/api/musteriler', { ad_soyad: 'Silinecek Müşteri' });
  const dosya = fs.readFileSync(path.join(klasor, g.dosyalar[0].dosya));
  const yukle = (sifre) =>
    fetch(`${sunucu.base}/api/yedekleme/import-dosya`, {
      method: 'POST',
      headers: { Cookie: admin.cerez(), 'Content-Type': 'application/octet-stream', ...(sifre ? { 'X-Yedek-Sifre': encodeURIComponent(sifre) } : {}) },
      body: dosya
    }).then(async (r) => ({ status: r.status, data: await r.json() }));
  assert.match((await yukle('')).data.error, /şifreli/);
  assert.match((await yukle('yanlis-sifre!')).data.error, /Şifre yanlış/);
  const ok = await yukle('Eczane-Yedek-2026');
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await admin.get('/api/musteriler')).data.length, once, 'yedek anındaki veriye döndü');
});
