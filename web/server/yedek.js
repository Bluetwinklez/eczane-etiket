const fs = require('node:fs');
const path = require('node:path');
const { db, ayarOku, ayarYaz } = require('./db');

const TABLO_SIRASI = [
  'subeler',
  'kullanicilar',
  'ilaclar',
  'musteriler',
  'tedarikciler',
  'ilac_stok',
  'fiyat_gecmisi',
  'stok_hareketleri',
  'satislar',
  'satis_kalemleri',
  'bildirimler',
  'kasa_kapanislari',
  'giderler',
  'siparisler',
  'siparis_kalemleri',
  'gorevler',
  'nobetler',
  'ilac_partileri',
  'satis_kalemi_partileri',
  'kampanyalar',
  'cari_hareketler',
  'iadeler',
  'iade_kalemleri',
  'etkilesimler',
  'ilac_hatirlatmalari',
  'sayimlar',
  'sayim_kalemleri',
  'transferler',
  'transfer_kalemleri',
  'mal_kabulleri',
  'mal_kabul_kalemleri',
  'satis_odemeleri',
  'bekleyen_sepetler',
  'puan_hareketleri',
  'istekler',
  'emanetler'
];

const DOSYA_DESENI = /^eczanem-otomatik-\d{4}-\d{2}-\d{2}-\d{6}\.json$/;
const GUN_MS = 24 * 60 * 60 * 1000;

function yedekVerisi() {
  const tablolar = {};
  for (const tablo of TABLO_SIRASI) tablolar[tablo] = db.prepare(`SELECT * FROM ${tablo}`).all();
  return { olusturma_tarihi: new Date().toISOString(), tablolar };
}

function yedekDizini() {
  return process.env.ECZANEM_YEDEK_DIZINI || path.join(__dirname, '..', 'data', 'yedekler');
}

function saklanacakSayi() {
  return Math.max(1, Number(process.env.ECZANEM_YEDEK_SAKLA) || 14);
}

function otomatikYedekleriListele() {
  const dizin = yedekDizini();
  if (!fs.existsSync(dizin)) return [];
  return fs
    .readdirSync(dizin)
    .filter((f) => DOSYA_DESENI.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dizin, f));
      return { dosya: f, boyut: st.size, tarih: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.dosya < b.dosya ? 1 : -1));
}

// Yalnizca bizim urettigimiz dosya adlarina izin verilir (dizin disina cikilamaz)
function yedekDosyaYolu(dosya) {
  if (!DOSYA_DESENI.test(String(dosya))) return null;
  const yol = path.join(yedekDizini(), dosya);
  return fs.existsSync(yol) ? yol : null;
}

// Son otomatik yedekten 24 saat gectiyse (veya zorla) yeni yedek alir, eskileri siler
function otomatikYedekAl({ zorla = false } = {}) {
  const son = Number(ayarOku('son_otomatik_yedek') || 0);
  if (!zorla && Date.now() - son < GUN_MS) return { alindi: false, sebep: 'son 24 saat icinde alinmis' };

  const dizin = yedekDizini();
  fs.mkdirSync(dizin, { recursive: true });
  const damga = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dosya = `eczanem-otomatik-${damga.slice(0, 4)}-${damga.slice(4, 6)}-${damga.slice(6, 8)}-${damga.slice(9, 15)}.json`;
  const gecici = path.join(dizin, dosya + '.tmp');
  // Yarim kalmis dosya birakmamak icin once gecici dosyaya yazilip yeniden adlandirilir
  fs.writeFileSync(gecici, JSON.stringify(yedekVerisi()));
  fs.renameSync(gecici, path.join(dizin, dosya));
  ayarYaz('son_otomatik_yedek', String(Date.now()));

  const silinenler = [];
  for (const eski of otomatikYedekleriListele().slice(saklanacakSayi())) {
    fs.unlinkSync(path.join(dizin, eski.dosya));
    silinenler.push(eski.dosya);
  }
  return { alindi: true, dosya, silinenler };
}

// Sunucu acikken saatte bir kontrol eder; gunde bir yedek alinir
function otomatikYedeklemeyiBaslat() {
  if (process.env.ECZANEM_OTOMATIK_YEDEK === '0') return null;
  const kontrol = () => {
    try {
      const r = otomatikYedekAl();
      if (r.alindi) console.log(`Otomatik yedek alindi: ${r.dosya}`);
    } catch (err) {
      console.error('Otomatik yedek alinamadi:', err.message);
    }
  };
  setTimeout(kontrol, 60 * 1000).unref();
  const zamanlayici = setInterval(kontrol, 60 * 60 * 1000);
  zamanlayici.unref();
  return zamanlayici;
}

module.exports = { TABLO_SIRASI, yedekVerisi, otomatikYedekAl, otomatikYedekleriListele, yedekDosyaYolu, otomatikYedeklemeyiBaslat };
