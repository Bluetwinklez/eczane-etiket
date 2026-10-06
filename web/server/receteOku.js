// Recete metni (fotograftan OCR ya da yapistirilan metin) → ilac satirlari, adet, kullanim, katalog eslesmesi.
// OCR hatalarina toleransli: marka adi 1 harf farkla da eslesir ("PAR0L" → "PAROL").
const { sadelestir } = require('./ilacBilgi');

const BASLIK_KELIMELERI = /\b(hasta|doktor|dr\b|hekim|tc|t\.c|kimlik|tarih|tani|teshis|kurum|protokol|tesis|imza|adres|telefon|tel\b|brans|diploma|sicil|yas|cinsiyet|recete turu|recete no|e-recete|takip|sgk|provizyon|aciklama|sayfa)\b/;
const BIRIM = /^(mg|mcg|µg|ml|gr|g|iu|ui|tb|tablet|tablt|tbl|kapsul|kps|kap|film|kapli|surup|şurup|damla|ampul|amp|flakon|krem|pomad|merhem|sprey|inhaler|saset|efervesan|draje|fort|forte|plus|duo)$/;

function norm(m) {
  return sadelestir(m)
    .replace(/[|_]/g, ' ')
    .replace(/([a-z])0(?=[a-z])/g, '$1o')
    .replace(/([a-z])1(?=[a-z])/g, '$1i')
    .replace(/([a-z])5(?=[a-z])/g, '$1s')
    .replace(/(\d)[.,](\d)/g, '$1.$2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function kelimeler(m) {
  const n = norm(m);
  return {
    sozcuk: n.split(' ').filter((t) => /^[a-z]{3,}$/.test(t)),
    sayi: n.split(' ').map((t) => t.replace(/\.$/, '')).filter((t) => /^\d+(\.\d+)?$/.test(t) && Number(t) > 0)
  };
}

// Iki kelime arasi duzenleme mesafesi (en fazla `sinir`; asarsa sinir+1 doner)
function mesafe(a, b, sinir = 1) {
  if (Math.abs(a.length - b.length) > sinir) return sinir + 1;
  let onceki = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const simdi = [i];
    let enAz = i;
    for (let j = 1; j <= b.length; j++) {
      simdi[j] = Math.min(onceki[j] + 1, simdi[j - 1] + 1, onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      enAz = Math.min(enAz, simdi[j]);
    }
    if (enAz > sinir) return sinir + 1;
    onceki = simdi;
  }
  return onceki[b.length];
}

// OCR'da sik karisan karakterler: 0↔o, 1↔i/l, 5↔s
const ocrDuzelt = (t) => t.replace(/0/g, 'o').replace(/1/g, 'i').replace(/5/g, 's');

function adetBul(satir) {
  const s = norm(satir);
  const m = s.match(/(\d+)\s*(kutu|adet|ad|kt|box)\b/) || s.match(/\b(kutu|adet)\s*[:x]?\s*(\d+)/);
  if (!m) return 1;
  const n = Number(/^\d/.test(m[1]) ? m[1] : m[2]);
  return n >= 1 && n <= 20 ? n : 1;
}

function kullanimBul(satir) {
  const s = String(satir).toLocaleLowerCase('tr-TR').replace(',', '.');
  const m = s.match(/\b(\d)\s*[x×*]\s*(\d+(?:\.\d+)?(?:\/\d)?)\b/) || s.match(/günde\s*\d+\s*(?:kez|defa)?\s*\d*(?:\.\d+)?/);
  return m ? m[0].replace(/\s+/g, '') : null;
}

function receteBilgisi(metin) {
  const duz = String(metin || '');
  const no = (duz.match(/(?:e-?\s?re[cç]ete|re[cç]ete)\s*(?:no|numaras[ıi])\s*[:.]?\s*([0-9A-Z]{6,8})\b/i) || [])[1] || null;
  // Tani satirlarinda OCR "I10"u "110", "O"yu "0" okuyabilir; yalnizca bu satirlarda duzeltilir
  const taniMetni = duz
    .split(/\r?\n/)
    .filter((l) => /tan[ıi]|te[sş]h[ıi]s|icd/i.test(l))
    .map((l) => l.replace(/\b1(\d{2}(?:\.\d{1,2})?)\b/g, 'I$1').replace(/\b0(\d{2}(?:\.\d{1,2})?)\b/g, 'O$1'))
    .join('\n');
  const tanilar = [...new Set(((duz + '\n' + taniMetni).toUpperCase().match(/\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b/g) || []))].slice(0, 10);
  return { recete_no: no ? no.toUpperCase() : null, tanilar };
}

// Ilac satiri adaylari: harf iceren, baslik/hasta bilgisi olmayan satirlar
function ilacSatirlari(metin) {
  return String(metin || '')
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 4 && /[a-zA-ZçğıöşüÇĞİÖŞÜ]{3,}/.test(s))
    .filter((s) => !BASLIK_KELIMELERI.test(norm(s).replace(/\./g, ' ')) || /\d\s*(mg|ml|tablet|kutu)/i.test(s))
    .slice(0, 40);
}

// urunler: [{ id, ad, kaynak, ... }]; marka (ilk kelime) dizini ile hizli aday secimi
function dizinOlustur(urunler) {
  const dizin = new Map();
  for (const u of urunler) {
    const k = kelimeler(u.ad);
    const marka = k.sozcuk[0];
    if (!marka) continue;
    const kayit = { ...u, _k: k, _marka: marka };
    if (!dizin.has(marka)) dizin.set(marka, []);
    dizin.get(marka).push(kayit);
  }
  return dizin;
}

function satiriEslestir(satir, dizin, anahtarlar) {
  const k = kelimeler(satir);
  const sozcukler = k.sozcuk.map(ocrDuzelt);
  const markalar = new Set();
  for (const t of sozcukler) {
    if (dizin.has(t)) markalar.add(t);
    else if (t.length >= 5) for (const a of anahtarlar) if (a.length >= 5 && a[0] === t[0] && mesafe(t, a) <= 1) markalar.add(a);
  }
  const adaylar = [];
  for (const marka of markalar) {
    for (const u of dizin.get(marka)) {
      let skor = 3;
      for (const t of u._k.sozcuk.slice(1)) if (sozcukler.includes(t) && !BIRIM.test(t)) skor += 1;
      for (const n of u._k.sayi) skor += k.sayi.includes(n) ? 1.5 : -0.5;
      if (u.kaynak === 'katalog') skor += 1;
      adaylar.push({ id: u.id, barkod: u.barkod, ad: u.ad, kaynak: u.kaynak, stok: u.stok, satis_fiyati: u.satis_fiyati, skor: Math.round(skor * 10) / 10 });
    }
  }
  adaylar.sort((a, b) => b.skor - a.skor || (b.kaynak === 'katalog') - (a.kaynak === 'katalog') || a.ad.localeCompare(b.ad, 'tr'));
  return adaylar.slice(0, 4);
}

function receteyiCoz(metin, urunler) {
  const dizin = dizinOlustur(urunler);
  const anahtarlar = [...dizin.keys()];
  const kalemler = [];
  for (const satir of ilacSatirlari(metin)) {
    const adaylar = satiriEslestir(satir, dizin, anahtarlar);
    if (!adaylar.length) continue;
    kalemler.push({ satir, adet: adetBul(satir), kullanim: kullanimBul(satir), adaylar });
  }
  return { ...receteBilgisi(metin), kalemler };
}

module.exports = { receteyiCoz, ilacSatirlari, adetBul, kullanimBul, receteBilgisi, mesafe, norm };
