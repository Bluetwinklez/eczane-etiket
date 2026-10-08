// Eczam iOS kabuğu testleri: ayar tutarlılığı, bağlantı adresi doğrulama, mağaza metni sınırları,
// ekran görüntüsü boyutları ve gizli dosya koruması. Ağ ve Xcode gerektirmez.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const KOK = path.join(__dirname, '..', '..');
const oku = (...p) => fs.readFileSync(path.join(KOK, ...p), 'utf8');
const BUNDLE = 'com.bluetwinklez.eczam';

test('bundle ID Capacitor, Xcode ve TestFlight iş akışında aynı', () => {
  const cap = JSON.parse(oku('mobil-uygulama', 'capacitor.config.json'));
  assert.equal(cap.appId, BUNDLE);
  assert.equal(cap.appName, 'Eczam');
  // Her eczanenin sunucu adresi farkli: kayitli sunucuya gecis uygulama icinde kalmali.
  // Bos liste olursa Capacitor sunucu sayfasini Safari'de acar (WebViewDelegationHandler).
  assert.deepEqual(cap.server.allowNavigation, ['*']);
  assert.equal(cap.ios.appendUserAgent, 'EczamApp/1.0');
  const pbx = oku('mobil-uygulama', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  const kimlikler = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
  assert.ok(kimlikler.length >= 2);
  assert.ok(kimlikler.every((k) => k === BUNDLE), kimlikler.join(','));
  assert.match(oku('.github', 'workflows', 'testflight.yml'), new RegExp(`BUNDLE_ID: ${BUNDLE.replace(/\./g, '\\.')}`));
  assert.match(oku('tool', 'asc_status.py'), new RegExp(BUNDLE.replace(/\./g, '\\.')));
});

test('Info.plist: izinler, şifreleme beyanı, diller, iPhone/dikey', () => {
  const plist = oku('mobil-uygulama', 'ios', 'App', 'App', 'Info.plist');
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  assert.match(plist, /<key>NSCameraUsageDescription<\/key>\s*<string>[^<]{20,}<\/string>/);
  assert.match(plist, /<key>NSLocalNetworkUsageDescription<\/key>\s*<string>[^<]{20,}<\/string>/);
  assert.match(plist, /<key>CFBundleLocalizations<\/key>\s*<array>\s*<string>tr<\/string>\s*<string>en<\/string>/);
  assert.match(plist, /<key>CFBundleDevelopmentRegion<\/key>\s*<string>tr<\/string>/);
  assert.match(plist, /<key>UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/);
  const pbx = oku('mobil-uygulama', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  assert.ok(!/TARGETED_DEVICE_FAMILY = "?1,2/.test(pbx), 'iPad desteği kapalı olmalı');
  assert.ok(pbx.includes('TARGETED_DEVICE_FAMILY = 1;'));
});

test('izin metinleri her dilde var ve Info.plist ile aynı anahtarlar', () => {
  const anahtarlar = (dil) => {
    const metin = oku('mobil-uygulama', 'ios', 'App', 'App', `${dil}.lproj`, 'InfoPlist.strings');
    const sonuc = {};
    for (const m of metin.matchAll(/^"([^"]+)" = "([^"]+)";$/gm)) sonuc[m[1]] = m[2];
    return sonuc;
  };
  const tr = anahtarlar('tr');
  const en = anahtarlar('en');
  const beklenen = ['CFBundleDisplayName', 'NSCameraUsageDescription', 'NSLocalNetworkUsageDescription'];
  assert.deepEqual(Object.keys(tr).sort(), beklenen);
  assert.deepEqual(Object.keys(en).sort(), beklenen);
  for (const k of beklenen.slice(1)) {
    assert.ok(tr[k].length > 20 && en[k].length > 20);
    assert.notEqual(tr[k], en[k]);
  }
  const pbx = oku('mobil-uygulama', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  assert.match(pbx, /InfoPlist\.strings in Resources/);
  assert.match(pbx, /path = tr\.lproj\/InfoPlist\.strings/);
  assert.match(pbx, /path = en\.lproj\/InfoPlist\.strings/);
});

function baglanYukle() {
  const kutu = () => ({ addEventListener() {}, appendChild() {}, set textContent(v) {}, hidden: false, value: '', style: {} });
  const pencere = {};
  const baglam = {
    window: pencere,
    document: { querySelector: kutu, createElement: kutu },
    location: { search: '', replace() {} },
    // Kayitli internet sunucusu: yuklemede ag taramasi baslamasin (testte gereksiz zamanlayicilar)
    localStorage: { getItem: () => 'https://eczam.ornek.com', setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: false }),
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  };
  baglam.window = baglam;
  vm.runInNewContext(oku('mobil-uygulama', 'www', 'baglan.js'), baglam);
  return baglam.EczamBaglan;
}

test('bağlantı ekranı: adres doğrulama kuralları', () => {
  const { adresiHazirla } = baglanYukle();
  assert.equal(adresiHazirla('eczam.ornek.com').adres, 'https://eczam.ornek.com');
  assert.equal(adresiHazirla('https://eczam.ornek.com/mobil/?x=1').adres, 'https://eczam.ornek.com');
  assert.equal(adresiHazirla('192.168.1.20:3000').adres, 'http://192.168.1.20:3000');
  assert.equal(adresiHazirla('http://localhost:3000').adres, 'http://localhost:3000');
  assert.equal(adresiHazirla('eczane.local').adres, 'http://eczane.local');
  assert.equal(adresiHazirla('192.168.1.20').adres, 'http://192.168.1.20:3000', 'yerel IP icin varsayilan Eczam portu');
  assert.match(adresiHazirla('http://eczam.ornek.com').hata, /HTTPS/);
  assert.match(adresiHazirla('').hata, /yazın/);
  assert.ok(adresiHazirla('ftp://x.com').hata);
  assert.ok(adresiHazirla('javascript:alert(1)').hata);
  assert.ok(adresiHazirla('https://user:pass@eczam.ornek.com').hata);
  assert.ok(adresiHazirla('http://0.0.0.0:3000').hata);
});

test('ilk açılış: yerel ağda Eczam aranır, bulunca ağ biter ve tarama durur', async () => {
  const { agAdresleri, agiTara, AGLAR } = baglanYukle();
  const liste = agAdresleri('192.168.1');
  assert.equal(liste.length, 254);
  assert.equal(liste[0], 'http://192.168.1.1:3000');
  assert.equal(liste[253], 'http://192.168.1.254:3000');
  assert.equal(AGLAR[0], '192.168.1');

  const sorulan = [];
  const yoklayici = async (adres) => {
    sorulan.push(adres);
    return adres === 'http://192.168.0.37:3000' ? { adres, ad: 'Merkez' } : null;
  };
  const bulunan = await agiTara({ aglar: ['192.168.1', '192.168.0', '10.0.0'], eszamanli: 16, yoklayici });
  assert.deepEqual(JSON.parse(JSON.stringify(bulunan)), [{ adres: 'http://192.168.0.37:3000', ad: 'Merkez' }]);
  assert.equal(sorulan.length, 254 * 2, 'bulunan ağdan sonraki ağ taranmaz');

  let say = 0;
  const iptalli = await agiTara({ aglar: ['192.168.1'], eszamanli: 4, iptal: () => say >= 10, yoklayici: async () => (say++, null) });
  assert.equal(iptalli.length, 0);
  assert.ok(say < 20, 'iptal edilince tarama durur');
});

test('ilk açılış ekranı adres sormadan aramayla başlar', () => {
  const html = oku('mobil-uygulama', 'www', 'index.html');
  assert.match(html, /<form id="form" novalidate hidden>/);
  assert.match(html, /id="elle"/);
  assert.match(html, /id="arama"/);
  const js = oku('mobil-uygulama', 'www', 'baglan.js');
  assert.match(js, /\} else \{\n    aramayiBaslat\(\);\n  \}/);
});

test('mağaza metni sınırları (docs/STORE_LISTING.md)', () => {
  const metin = oku('docs', 'STORE_LISTING.md');
  const al = (re) => {
    const m = metin.match(re);
    assert.ok(m, `bulunamadı: ${re}`);
    return m[1].trim();
  };
  const ad = al(/\*\*Ad:\*\* (.+)/);
  assert.ok([...ad].length <= 30);
  for (const re of [/\*\*Alt başlık:\*\* (.+)/, /\*\*Subtitle:\*\* (.+)/]) assert.ok([...al(re)].length <= 30, re.source);
  for (const re of [/\*\*Anahtar kelimeler:\*\* `([^`]+)`/, /\*\*Keywords:\*\* `([^`]+)`/]) {
    const k = al(re);
    assert.ok(k.length <= 100, re.source);
    assert.ok(!/\s/.test(k), 'anahtar kelimelerde boşluk olmamalı');
  }
  for (const re of [/\*\*Tanıtım metni:\*\* (.+)/, /\*\*Promotional text:\*\* (.+)/]) assert.ok([...al(re)].length <= 170, re.source);
  const aciklamalar = [...metin.matchAll(/\*\*Açıklama:\*\*\s*\n\s*```\n([\s\S]*?)```|\*\*Description:\*\*\s*\n\s*```\n([\s\S]*?)```/g)];
  assert.equal(aciklamalar.length, 2);
  for (const a of aciklamalar) assert.ok((a[1] || a[2]).length <= 4000);
  assert.ok(!/Eczanem/.test(metin), 'eski ad kalmamalı');
});

test('mağaza ekran görüntüleri (tr + en): iPhone 6,9" (1320×2868), RGB, alfa yok', () => {
  for (const alt of ['', 'en']) {
    const dizin = path.join(KOK, 'docs', 'magaza', alt);
    const dosyalar = fs.readdirSync(dizin).filter((f) => f.endsWith('.png'));
    assert.ok(dosyalar.length >= 3 && dosyalar.length <= 10, `${alt || 'tr'}: 3-10 görüntü olmalı`);
    for (const f of dosyalar) {
      const b = fs.readFileSync(path.join(dizin, f));
      assert.equal(b.readUInt32BE(16), 1320, f);
      assert.equal(b.readUInt32BE(20), 2868, f);
      assert.equal(b[25], 2, `${f}: renk türü 2 (RGB, alfa yok) olmalı`);
    }
  }
});

test('uygulama simgesi 1024×1024 ve alfa kanalsız', () => {
  const b = fs.readFileSync(path.join(KOK, 'mobil-uygulama', 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png'));
  assert.equal(b.readUInt32BE(16), 1024);
  assert.equal(b.readUInt32BE(20), 1024);
  assert.equal(b[25], 2);
});

test('gizlilik politikası dosyası iletişim e-postasını içerir', () => {
  const metin = oku('docs', 'PRIVACY.md');
  assert.match(metin, /doflerim@gmail\.com/);
  assert.match(metin, /Eczam/);
  assert.ok(!/Eczanem/.test(metin));
});

test('depoda anahtar, sertifika veya keystore yok', () => {
  const dosyalar = execFileSync('git', ['ls-files'], { cwd: KOK, encoding: 'utf8' }).split('\n').filter(Boolean);
  const yasak = /(\.p12|\.p8|\.pfx|\.mobileprovision|\.keystore|\.jks)$|(^|\/)key\.properties$|AuthKey_/i;
  assert.deepEqual(dosyalar.filter((f) => yasak.test(f)), []);
  for (const f of dosyalar.filter((x) => /\.(js|py|rb|yml|json|md|plist|html|swift|strings)$/.test(x) && !x.includes('package-lock'))) {
    if (!fs.existsSync(path.join(KOK, f))) continue;
    const icerik = fs.readFileSync(path.join(KOK, f), 'utf8');
    assert.ok(!/BEGIN (EC |RSA )?PRIVATE KEY-----\s*[A-Za-z0-9+/=]{20}/.test(icerik), `${f}: özel anahtar içeriyor`);
  }
});

test('TestFlight iş akışı: üç mod ve gerekli secret adları', () => {
  const y = oku('.github', 'workflows', 'testflight.yml');
  assert.match(y, /upload:/);
  assert.match(y, /provision_only:/);
  for (const s of ['IOS_APPSTORE_P12_BASE64', 'IOS_APPSTORE_P12_PASSWORD', 'ASC_API_KEY_ID', 'ASC_API_ISSUER_ID', 'ASC_API_PRIVATE_KEY_BASE64',
    'ASC_ADMIN_KEY_ID', 'ASC_ADMIN_PRIVATE_KEY', 'IOS_TEAM_ID', 'IOS_BUNDLE_ID', 'IOS_APPSTORE_PROFILE_BASE64']) {
    assert.ok(y.includes(`secrets.${s}`), s);
  }
  assert.ok(!/65S88D9LF5/.test(y), 'takım kimliği secret olarak okunmalı');
});
