// Hata gunlugu: sunucu ve tarayici hatalari data/hatalar.log dosyasina satir satir (JSON) yazilir.
// "Hata raporu" ekrani son kayitlari gosterir; kullanici bu metni kopyalayip destege iletir.
const fs = require('fs');
const path = require('path');

const MAKS_BOYUT = 1024 * 1024; // 1 MB'i gecince eski dosya .1 olarak saklanir

function gunlukYolu() {
  if (process.env.ECZANEM_HATA_GUNLUGU) return process.env.ECZANEM_HATA_GUNLUGU;
  const db = process.env.ECZANEM_DB_PATH;
  const klasor = db && db !== ':memory:' ? path.dirname(db) : path.join(__dirname, '..', 'data');
  return path.join(klasor, 'hatalar.log');
}

// Testlerde (bellek ici veritabani) diske yazilmaz, son kayitlar bellekte tutulur
const bellek = [];
const diskeYaz = () => process.env.ECZANEM_DB_PATH !== ':memory:' || Boolean(process.env.ECZANEM_HATA_GUNLUGU);

// Gunluge sifre/oturum bilgisi dusmesin
function temizle(metin) {
  return String(metin == null ? '' : metin)
    .replace(/("?(sifre|password|yeni_sifre|mevcut_sifre|token|cookie)"?\s*[:=]\s*)("[^"]*"|\S+)/gi, '$1"***"')
    .slice(0, 4000);
}

function hataKaydet(kaynak, mesaj, ek = {}) {
  const kayit = {
    zaman: new Date().toISOString(),
    kaynak,
    mesaj: temizle(mesaj).slice(0, 500),
    ...Object.fromEntries(Object.entries(ek).map(([k, v]) => [k, temizle(v)]))
  };
  bellek.push(kayit);
  if (bellek.length > 200) bellek.shift();
  if (!diskeYaz()) return kayit;
  try {
    const yol = gunlukYolu();
    fs.mkdirSync(path.dirname(yol), { recursive: true });
    if (fs.existsSync(yol) && fs.statSync(yol).size > MAKS_BOYUT) fs.renameSync(yol, yol + '.1');
    fs.appendFileSync(yol, JSON.stringify(kayit) + '\n');
  } catch (e) {
    /* gunluk yazilamazsa uygulama calismaya devam eder */
  }
  return kayit;
}

function sonHatalar(adet = 30) {
  if (!diskeYaz()) return bellek.slice(-adet).reverse();
  try {
    const satirlar = fs.readFileSync(gunlukYolu(), 'utf8').trim().split('\n').slice(-adet);
    return satirlar
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch (e) {
    return [];
  }
}

module.exports = { hataKaydet, sonHatalar, gunlukYolu };
