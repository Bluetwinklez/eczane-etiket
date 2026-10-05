const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { guncellemeKontrol, surumBilgisi } = require('../server/surum');
const { hataKaydet, sonHatalar } = require('../server/hataGunlugu');
const app = require('../server/app');

let sunucu;
let admin;
let kasiyer;
before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('sürüm bilgisi: package sürümü ve (varsa) git commit', async () => {
  const s = (await kasiyer.get('/api/sistem/surum')).data;
  assert.equal(s.surum, require('../package.json').version);
  if (s.commit) assert.match(s.commit, /^[0-9a-f]{40}$/);
  assert.equal(s.kisa, s.commit ? s.commit.slice(0, 7) : null);
});

test('tarayıcı hatası kaydedilir; rapor yalnızca eczacı/yönetici içindir; şifre maskelenir', async () => {
  assert.equal((await kasiyer.post('/api/sistem/istemci-hata', {})).status, 400);
  const r = await kasiyer.post('/api/sistem/istemci-hata', { mesaj: 'x is not a function', sayfa: '#satis', yigin: 'at a (satis.js:10) sifre=gizli123' });
  assert.equal(r.status, 201);
  assert.equal((await kasiyer.get('/api/sistem/hata-raporu')).status, 403);
  const rapor = (await admin.get('/api/sistem/hata-raporu')).data;
  const h = rapor.hatalar.find((x) => x.mesaj === 'x is not a function');
  assert.ok(h);
  assert.equal(h.kaynak, 'tarayici');
  assert.equal(h.kullanici, 'kasiyer');
  assert.ok(!h.yigin.includes('gizli123'), 'şifre rapora düşmez');
});

test('beklenmeyen sunucu hatası JSON döner ve günlüğe yazılır', async () => {
  // Test icin uygulamaya gecici olarak hata atan bir yol eklenir (en sondaki hata isleyicisinden once)
  const yigin = app._router.stack;
  const express = require('express');
  const r = express.Router();
  r.get('/__hata_testi', () => {
    throw new Error('deneme patlaması');
  });
  app.use(r);
  const eklenen = yigin.pop();
  const hataIsleyici = yigin.findIndex((l) => l.handle && l.handle.length === 4);
  yigin.splice(hataIsleyici, 0, eklenen);

  const y = await fetch(sunucu.base + '/__hata_testi');
  assert.equal(y.status, 500);
  assert.match((await y.json()).error, /Beklenmeyen bir hata/);
  assert.ok(sonHatalar(5).some((h) => h.kaynak === 'sunucu' && h.mesaj === 'deneme patlaması' && h.yol === 'GET /__hata_testi'));
});

test('bozuk JSON gövdesi 400 döner (yığın gösterilmez)', async () => {
  const y = await fetch(sunucu.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bozuk' });
  assert.equal(y.status, 400);
  assert.match((await y.json()).error, /okunamadı/);
});

test('güncelleme kontrolü: güncel / yeni sürüm / bağlantı yok', async () => {
  const yerel = surumBilgisi();
  if (!yerel.commit) return; // git olmadan kurulmus ortam
  const sahte = (sha, ok = true) => async () => ({ ok, status: ok ? 200 : 503, json: async () => ({ sha, commit: { message: 'Yeni özellik\n\nayrıntı', committer: { date: '2026-10-05T10:00:00Z' } } }) });
  assert.equal((await guncellemeKontrol(sahte(yerel.commit))).durum, 'guncel');
  const yeni = await guncellemeKontrol(sahte('f'.repeat(40)));
  assert.equal(yeni.durum, 'yeni_surum_var');
  assert.equal(yeni.uzak.mesaj, 'Yeni özellik');
  assert.equal((await guncellemeKontrol(sahte('a', false))).durum, 'kontrol_edilemedi');
  assert.equal((await guncellemeKontrol(async () => { throw new Error('ağ yok'); })).durum, 'kontrol_edilemedi');
  assert.equal((await kasiyer.get('/api/sistem/guncelleme')).status, 403);
});

test('hata günlüğü uzun metni keser', () => {
  const k = hataKaydet('test', 'a'.repeat(2000));
  assert.equal(k.mesaj.length, 500);
});

test('Windows kurulum dosyaları: CRLF, BOM ve birbirine verdikleri adlar', () => {
  const klasor = path.join(__dirname, '..', '..', 'kurulum');
  const dosyalar = ['eczam-kur.ps1', 'Eczam-Kur.bat', 'eczam-baslat.bat', 'eczam-sunucu.bat', 'eczam-guncelle.bat', 'eczam-durdur.bat', 'eczam-gizli-baslat.vbs', 'eczam.ico'];
  for (const d of dosyalar) assert.ok(fs.existsSync(path.join(klasor, d)), d);
  const ps1 = fs.readFileSync(path.join(klasor, 'eczam-kur.ps1'));
  assert.deepEqual([...ps1.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'Windows PowerShell 5.1 Türkçe karakterleri BOM ile okur');
  for (const d of dosyalar.filter((x) => !x.endsWith('.ico'))) {
    const metin = fs.readFileSync(path.join(klasor, d), 'utf8');
    assert.ok(!/[^\r]\n/.test(metin), `${d} CRLF satır sonu kullanmalı`);
    for (const ad of metin.match(/eczam-[a-z-]+\.(bat|vbs|ps1)/g) || []) assert.ok(dosyalar.includes(ad), `${d} içinde geçen ${ad} yok`);
  }
  assert.ok(/^[\x00-\x7f]*$/.test(fs.readFileSync(path.join(klasor, 'eczam-gizli-baslat.vbs'), 'latin1')), 'VBS yalnız ASCII olmalı');
  assert.match(ps1.toString(), /npm\.cmd ci/, 'yürütme ilkesi npm.ps1\'i engellemesin diye npm.cmd kullanılır');
});
