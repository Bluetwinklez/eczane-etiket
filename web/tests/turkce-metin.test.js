const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db, demoMetinleriniDuzelt } = require('../server/db');

let sunucu;
let admin;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
});
after(() => sunucu.kapat());

test('demo verisi Türkçe karakterli; eski ASCII kayıtlar açılışta düzeltilir', () => {
  assert.equal(db.prepare("SELECT ad_soyad FROM kullanicilar WHERE kullanici_adi = 'admin'").get().ad_soyad, 'Sistem Yöneticisi');
  db.prepare("UPDATE ilaclar SET kategori = 'Agri Kesici' WHERE id = 1").run();
  db.prepare("UPDATE musteriler SET ad_soyad = 'Ahmet Yilmaz Bey' WHERE id = 2").run(); // kullanicinin degistirdigi kayit
  demoMetinleriniDuzelt();
  assert.equal(db.prepare('SELECT kategori FROM ilaclar WHERE id = 1').get().kategori, 'Ağrı Kesici');
  assert.equal(db.prepare('SELECT ad_soyad FROM musteriler WHERE id = 2').get().ad_soyad, 'Ahmet Yilmaz Bey');
});

test('PDF raporu Türkçe karakter destekli yazı tipiyle üretilir ve hata mesajları Türkçe', async () => {
  const res = await fetch(sunucu.base + '/api/raporlar/en-cok-satan?format=pdf', { headers: { Cookie: admin.cerez() } });
  assert.equal(res.status, 200);
  const pdf = Buffer.from(await res.arrayBuffer()).toString('latin1');
  assert.match(pdf, /DejaVuSans/);
  assert.doesNotMatch(pdf, /\/BaseFont \/Helvetica/);
  const r = await admin.get('/api/ilaclar/999999');
  assert.equal(r.status, 404);
  assert.match(r.data.error, /bulunamadı/);
});
