// Bulut yedegi: gunluk yedegin sifrelenmis kopyasi OneDrive / Google Drive / Dropbox gibi bir esitleme klasorune yazilir;
// esitleme programi dosyayi buluta tasir. API anahtari gerekmez. Sifreleme: scrypt + AES-256-GCM (gzip'li JSON).
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { ayarOku, ayarYaz } = require('./db');

const AYAR = 'bulut_yedek';
const IMZA = Buffer.from('ECZAMYDK1');
const DESEN = /^Eczam-yedek-\d{4}-\d{2}-\d{2}-\d{6}\.(eczam|json\.gz)$/;
const VARSAYILAN = { aktif: false, klasor: '', sifre: '', sakla: 30, son: null };

function ayarlar() {
  try {
    return { ...VARSAYILAN, ...JSON.parse(ayarOku(AYAR) || '{}') };
  } catch {
    return { ...VARSAYILAN };
  }
}
function ayarlariYaz(yeni) {
  const a = { ...ayarlar(), ...yeni };
  ayarYaz(AYAR, JSON.stringify(a));
  return a;
}
// Disariya sifre gonderilmez
const disaAcik = (a) => ({ aktif: a.aktif, klasor: a.klasor, sakla: a.sakla, son: a.son, sifre_var: Boolean(a.sifre) });

function anahtar(sifre, tuz) {
  return crypto.scryptSync(String(sifre), tuz, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function sifrele(metin, sifre) {
  const tuz = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', anahtar(sifre, tuz), iv);
  const govde = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(metin))), c.final()]);
  return Buffer.concat([IMZA, tuz, iv, c.getAuthTag(), govde]);
}

// Sifreli (.eczam), gzip (.json.gz) ya da duz JSON yedegi metne cevirir
function yedegiAc(tampon, sifre) {
  if (tampon.subarray(0, IMZA.length).equals(IMZA)) {
    if (!sifre) {
      const e = new Error('Bu yedek şifreli; şifreyi girin');
      e.kullanici = true;
      throw e;
    }
    const o = IMZA.length;
    const tuz = tampon.subarray(o, o + 16);
    const iv = tampon.subarray(o + 16, o + 28);
    const etiket = tampon.subarray(o + 28, o + 44);
    const d = crypto.createDecipheriv('aes-256-gcm', anahtar(sifre, tuz), iv);
    d.setAuthTag(etiket);
    try {
      return zlib.gunzipSync(Buffer.concat([d.update(tampon.subarray(o + 44)), d.final()])).toString('utf8');
    } catch {
      const e = new Error('Şifre yanlış ya da dosya bozuk');
      e.kullanici = true;
      throw e;
    }
  }
  if (tampon[0] === 0x1f && tampon[1] === 0x8b) return zlib.gunzipSync(tampon).toString('utf8');
  return tampon.toString('utf8');
}

// Windows/macOS'ta yaygin esitleme klasorleri (varsa)
function klasorAdaylari(ev = os.homedir()) {
  const adaylar = [];
  const ekle = (ad, yol) => {
    try {
      if (yol && fs.existsSync(yol) && fs.statSync(yol).isDirectory()) adaylar.push({ ad, yol: path.join(yol, 'Eczam Yedekleri') });
    } catch {
      /* erisilemeyen klasor atlanir */
    }
  };
  try {
    for (const f of fs.readdirSync(ev)) if (/^OneDrive/i.test(f)) ekle(f.replace(/^OneDrive\s*-\s*/i, 'OneDrive '), path.join(ev, f));
  } catch {
    /* ev dizini okunamadi */
  }
  ekle('Google Drive', path.join(ev, 'Google Drive'));
  ekle('Google Drive (G:)', 'G:\\My Drive');
  ekle('Google Drive (G:)', 'G:\\Drive\'ım');
  ekle('Dropbox', path.join(ev, 'Dropbox'));
  ekle('iCloud Drive', path.join(ev, 'iCloudDrive'));
  ekle('iCloud Drive', path.join(ev, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'));
  return adaylar;
}

function bulutYedekleri(klasor) {
  if (!klasor || !fs.existsSync(klasor)) return [];
  return fs
    .readdirSync(klasor)
    .filter((f) => DESEN.test(f))
    .map((f) => ({ dosya: f, boyut: fs.statSync(path.join(klasor, f)).size }))
    .sort((a, b) => (a.dosya < b.dosya ? 1 : -1));
}

// Yedek metnini bulut klasorune yazar; eskileri temizler. Ayarli degilse null.
function bulutaYaz(metin, simdi = new Date()) {
  const a = ayarlar();
  if (!a.aktif || !a.klasor) return null;
  let sonuc;
  try {
    fs.mkdirSync(a.klasor, { recursive: true });
    const d = simdi.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const ad = `Eczam-yedek-${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}-${d.slice(9, 15)}.${a.sifre ? 'eczam' : 'json.gz'}`;
    const veri = a.sifre ? sifrele(metin, a.sifre) : zlib.gzipSync(Buffer.from(metin));
    const gecici = path.join(a.klasor, ad + '.tmp');
    fs.writeFileSync(gecici, veri);
    fs.renameSync(gecici, path.join(a.klasor, ad));
    for (const eski of bulutYedekleri(a.klasor).slice(Math.max(1, Number(a.sakla) || 30))) fs.unlinkSync(path.join(a.klasor, eski.dosya));
    sonuc = { durum: 'tamam', dosya: ad, boyut: veri.length, sifreli: Boolean(a.sifre) };
  } catch (err) {
    sonuc = { durum: 'hata', mesaj: err.message };
  }
  ayarlariYaz({ son: { ...sonuc, tarih: simdi.toISOString() } });
  return sonuc;
}

module.exports = { ayarlar, ayarlariYaz, disaAcik, sifrele, yedegiAc, klasorAdaylari, bulutYedekleri, bulutaYaz };
