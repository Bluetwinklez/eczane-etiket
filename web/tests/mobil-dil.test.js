const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const kaynak = fs.readFileSync(path.join(__dirname, '..', 'public', 'mobil', 'mobil-dil.js'), 'utf8');

function yukle(dilKodu) {
  const depo = dilKodu ? { 'eczanem:dil': dilKodu } : {};
  const pencere = {
    navigator: { language: 'tr-TR' },
    localStorage: { getItem: (k) => (k in depo ? depo[k] : null), setItem: (k, v) => (depo[k] = v) },
    document: { documentElement: {}, body: null, addEventListener() {} },
    location: { reload() {} },
    MutationObserver: class { observe() {} },
    confirm: () => true, prompt: () => '', alert() {}
  };
  pencere.window = pencere;
  vm.runInNewContext(kaynak, pencere);
  return pencere;
}

test('dil seçimi: kayıtlı dil, yoksa cihaz dili', () => {
  assert.equal(yukle().EczamDil.dil, 'tr');
  assert.equal(yukle('en').EczamDil.dil, 'en');
  assert.equal(yukle('en').EczamDil.yerel, 'en-US');
  assert.equal(yukle('tr').EczamDil.yerel, 'tr-TR');
  const yabanci = (() => {
    const p = { navigator: { language: 'de-DE' }, localStorage: { getItem: () => null, setItem() {} }, document: { documentElement: {}, body: null, addEventListener() {} }, location: {}, MutationObserver: class { observe() {} }, confirm() {}, prompt() {}, alert() {} };
    p.window = p;
    vm.runInNewContext(kaynak, p);
    return p.EczamDil.dil;
  })();
  assert.equal(yabanci, 'en', 'Türkçe olmayan cihaz İngilizce açılır');
});

test('Türkçe modda metinler değişmez', () => {
  const { t } = yukle('tr').EczamDil;
  assert.equal(t('Satışı tamamla'), 'Satışı tamamla');
});

test('İngilizce: sözlük, kurallar ve " · " ile birleşik metinler çevrilir', () => {
  const { t } = yukle('en').EczamDil;
  assert.equal(t('Satışı tamamla'), 'Complete sale');
  assert.equal(t('Merhaba Ayşe!'), 'Hello Ayşe!');
  assert.equal(t('  Hızlı satış  '), '  Quick sale  ', 'boşluklar korunur');
  assert.equal(t('Stok 9 · günde ~22.6 · önerilen sipariş 669'), 'Stock 9 · ~22.6/day · suggested order 669');
  assert.equal(t('Parti P-2308 · 8 adet · SKT 01.10.2026'), 'Batch P-2308 · 8 pcs · Exp 01.10.2026');
  assert.equal(t('+7.816,80 ₺ fazla, dünden'), '+7.816,80 ₺ more than yesterday');
  assert.equal(t('−23 ₺ az, geçen ayın aynı gününden'), '−23 ₺ less than the same day last month');
  assert.equal(t('Çar: 47 ₺'), 'Wed: 47 ₺');
  assert.equal(t('Tahsil edildi. Kalan borç: 29,80 ₺'), 'Collected. Remaining balance: 29,80 ₺');
  assert.equal(t('Parol 500mg 20 Tablet'), 'Parol 500mg 20 Tablet', 'ürün adları çevrilmez');
  assert.equal(t('Ayşe Yılmaz'), 'Ayşe Yılmaz', 'müşteri adları çevrilmez');
});

test('sunucunun bildirim merkezi metinleri çevrilir', () => {
  const { t } = yukle('en').EczamDil;
  const sunucu = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'bildirimMerkezi.js'), 'utf8');
  const metinler = [...sunucu.matchAll(/(?:baslik|aciklama):\s*(?:'([^']*)'|"([^"]*)")/g)].map((m) => m[1] || m[2]);
  assert.ok(metinler.length >= 20);
  const eksik = metinler.filter((m) => t(m) === m);
  assert.deepEqual(eksik, [], 'Çevirisi eksik bildirim metinleri');
});

test('sözlük tutarlı: boş değer yok, anahtar ile değer farklı (özel adlar hariç)', () => {
  const d = yukle('en').EczamDil;
  const aynilar = new Set(['Türkçe', 'English']);
  for (const [k, v] of Object.entries(d._sozluk)) {
    assert.ok(k.trim() && v.trim(), `boş: ${k}`);
    if (!aynilar.has(k)) assert.notEqual(k, v, `çevrilmemiş: ${k}`);
  }
});

test('mobil arayüz kaynaklarında yerel ayar sabit değil ve dil dosyası önbellekte', () => {
  const kok = path.join(__dirname, '..', 'public', 'mobil');
  const cekirdek = fs.readFileSync(path.join(kok, 'mobil.js'), 'utf8');
  assert.match(cekirdek, /toLocaleString\(YEREL/);
  assert.ok(!/toLocaleString\('tr-TR'/.test(cekirdek), 'tutar/tarih biçimi dile göre olmalı');
  assert.match(fs.readFileSync(path.join(kok, 'sw.js'), 'utf8').match(/const KABUK = \[([\s\S]*?)\];/)[1], /mobil-dil\.js/);
  const html = fs.readFileSync(path.join(kok, 'index.html'), 'utf8');
  assert.ok(html.indexOf('mobil-dil.js') < html.indexOf('mobil-islemler.js'), 'dil dosyası ilk yüklenir');
});
