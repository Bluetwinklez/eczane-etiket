const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, istemci, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

async function sonKayit(filtre = '') {
  const rows = (await admin.get('/api/islem-kayitlari?limit=5' + filtre)).data;
  return rows[0];
}

test('basarili yazma islemi kullanici ve kayit kimligiyle loglanir', async () => {
  await admin.post('/api/ilaclar/3/stok', { tip: 'giris', adet: 7, aciklama: 'sevkiyat' });
  const k = await sonKayit();
  assert.equal(k.kullanici_adi, 'admin');
  assert.equal(k.yontem, 'POST');
  assert.equal(k.kaynak, 'ilaclar');
  assert.equal(k.kayit_id, '3');
  assert.equal(k.durum_kodu, 200);
  assert.match(k.detay, /sevkiyat/);
});

test('yetkisiz deneme de 403 ile loglanir', async () => {
  await kasiyer.del('/api/ilaclar/1');
  const k = await sonKayit('&sadece_hatalar=1');
  assert.equal(k.kullanici_adi, 'kasiyer');
  assert.equal(k.durum_kodu, 403);
});

test('sifreler kayitlara asla yazilmaz', async () => {
  await admin.post('/api/kullanicilar', {
    kullanici_adi: 'gizlitest',
    sifre: 'CokGizli123',
    ad_soyad: 'Gizli Test',
    rol: 'kasiyer'
  });
  const k = await sonKayit('&kaynak=kullanicilar');
  assert.ok(!k.detay.includes('CokGizli123'));
  assert.match(k.detay, /"sifre":"\*\*\*"/);
});

test('basarisiz giris denemesi denenen kullanici adiyla loglanir', async () => {
  await istemci(sunucu.base).girisYap('admin', 'tahmin');
  const k = await sonKayit('&kaynak=auth');
  assert.equal(k.kullanici_adi, 'admin');
  assert.equal(k.durum_kodu, 401);
});

test('okuma istekleri loglanmaz', async () => {
  const once = (await admin.get('/api/islem-kayitlari?limit=2000')).data.length;
  await admin.get('/api/ilaclar');
  await admin.get('/api/musteriler');
  const sonra = (await admin.get('/api/islem-kayitlari?limit=2000')).data.length;
  assert.equal(sonra, once);
});

test('islem kaydina sadece admin erisebilir', async () => {
  assert.equal((await kasiyer.get('/api/islem-kayitlari')).status, 403);
});

test('yedek geri yukleme kaydi sadece tablo ozetini tutar ve kayitlar silinmez', async () => {
  const yedek = (await admin.get('/api/yedekleme/export')).data;
  const once = (await admin.get('/api/islem-kayitlari?limit=2000')).data.length;
  await admin.post('/api/yedekleme/import', yedek);
  const rows = (await admin.get('/api/islem-kayitlari?limit=2000')).data;
  assert.equal(rows.length, once + 1, 'geri yukleme mevcut islem kayitlarini silmemeli');
  assert.match(rows[0].detay, /"ilaclar":\d+/);
  assert.ok(rows[0].detay.length < 500);
});
