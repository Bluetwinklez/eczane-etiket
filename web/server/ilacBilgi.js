// Ilac karti yardimcilari: tablet ozellikleri, hasta maliyeti, eski/yeni fiyat hareketi karsilastirma.
const RENKLER = ['beyaz', 'sarı', 'turuncu', 'kırmızı', 'pembe', 'mor', 'mavi', 'yeşil', 'kahverengi', 'gri', 'siyah', 'krem'];
const SEKILLER = ['yuvarlak', 'oval', 'uzun', 'kapsül', 'üçgen', 'kare', 'altıgen', 'elmas', 'diğer'];
const CENTIKLER = ['yok', 'tek', 'çift'];

// SGK katilim payi oranlari (varsayilan). Mevzuat degisebilir; ekranda "tahmini" olarak gosterilir.
const KATILIM_ORANLARI = { aktif: 0.2, emekli: 0.1, muaf: 0 };
const HASTA_ADLARI = { aktif: 'Aktif çalışan / bakmakla yükümlü', emekli: 'Emekli', muaf: 'Katılım payından muaf' };

const yuvarla = (n) => Math.round(n * 100) / 100;
const kucuk = (m) => String(m || '').toLocaleLowerCase('tr-TR').trim();

// Sayi alanlari: bos -> null; "1.234,56" ve "1234.56" kabul edilir
function sayiOku(deger) {
  if (deger === undefined || deger === null || String(deger).trim() === '') return null;
  let s = String(deger).trim();
  s = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? yuvarla(n) : NaN;
}

function urlOku(deger) {
  if (deger === undefined || deger === null || String(deger).trim() === '') return null;
  const s = String(deger).trim();
  // javascript: gibi sema ile calisan baglantilar kabul edilmez
  return /^https?:\/\/[^\s]+$/i.test(s) ? s.slice(0, 500) : NaN;
}

function listeOku(deger, izinli, ad) {
  if (deger === undefined || deger === null || String(deger).trim() === '') return { deger: null };
  const parcalar = [...new Set(String(deger).split(/[,/+]/).map(kucuk).filter(Boolean))];
  const gecersiz = parcalar.find((p) => !izinli.includes(p));
  if (gecersiz) return { hata: `Geçersiz ${ad}: ${gecersiz}` };
  return { deger: parcalar.join(',') };
}

// Hasta payini hesaplar. Kamu fiyati yoksa hesaplanamaz (null).
// fiyat farki = PSF'nin kamu fiyatini asan kismi; katilim payi = oran x kamu odenecek tutar.
function hastaMaliyeti({ psf, kamuFiyati, kamuOdenecek, adet = 1, hasta = 'aktif' }) {
  if (!(kamuFiyati > 0)) return null;
  const oran = KATILIM_ORANLARI[hasta];
  if (oran === undefined) return null;
  const ko = kamuOdenecek > 0 ? kamuOdenecek : kamuFiyati;
  const fark = Math.max(0, psf - kamuFiyati);
  const katilim = ko * oran;
  const hastaOder = fark + katilim;
  return {
    hasta,
    hasta_adi: HASTA_ADLARI[hasta],
    oran,
    adet,
    psf: yuvarla(psf * adet),
    fiyat_farki: yuvarla(fark * adet),
    katilim_payi: yuvarla(katilim * adet),
    hasta_oder: yuvarla(hastaOder * adet),
    sgk_oder: yuvarla((ko - katilim) * adet)
  };
}


// ---- Urun adi ayristirma (ilac karti "urun ailesi" agaci icin) ----
// "PAROL 120 MG/5 ML 150 ML ORAL SUSPANSIYON" -> marka PAROL, hat PAROL, doz 120 MG/5 ML, ambalaj 150 ML ORAL SUSPANSIYON
const DOZ_DESENI = /(%\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|iu|ui|ü|mmol|meq)(?:\s*\/\s*\d*(?:[.,]\d+)?\s*(?:ml|g|doz|damla|saat|sa|h|l))?)/i;
function urunAdiCoz(ad) {
  const temiz = String(ad || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const ust = temiz.toLocaleUpperCase('tr-TR');
  const marka = (ust.split(' ')[0] || '').replace(/[^0-9A-ZÇĞİÖŞÜ.\-]/g, '');
  const m = temiz.match(DOZ_DESENI);
  if (!m) return { marka, hat: ust, doz: null, ambalaj: null };
  const hat = temiz.slice(0, m.index).trim().toLocaleUpperCase('tr-TR') || marka;
  const doz = m[0].replace(/\s+/g, '').toLocaleUpperCase('tr-TR').replace(/(\d)([A-ZÜµ])/g, '$1 $2');
  const ambalaj = temiz.slice(m.index + m[0].length).trim().toLocaleUpperCase('tr-TR') || null;
  return { marka, hat, doz, ambalaj };
}
// Gruplama anahtari: Turkce harfler sadelestirilir ("BİODERMA" = "BIODERMA"), bosluklar tek
const sadelestir = (m) =>
  String(m || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();

// ---- Dermokozmetik / bakim urunleri kategori agaci ----
const DERMA_AGACI = {
  'Anne & Bebek': ['Bebek şampuanı ve banyo', 'Pişik kremi', 'Bebek losyonu ve yağı', 'Bebek ıslak mendil', 'Bebek güneş kremi', 'Emzik ve biberon', 'Anne bakım (göğüs, çatlak)'],
  'Kişisel Bakım': ['Deodorant', 'Diş macunu', 'Diş fırçası ve ara yüz', 'Ağız bakım suyu', 'Duş jeli ve sabun', 'El kremi', 'Dudak bakımı', 'İntim bakım', 'Ayak bakımı'],
  'Saç Bakımı': ['Şampuan', 'Saç kremi', 'Saç serumu ve yağı', 'Saç maskesi', 'Dökülmeye karşı', 'Kepeğe karşı', 'Saç spreyi'],
  'Cilt Bakımı': ['Nemlendirici', 'Vücut losyonu', 'Akneye eğilimli cilt', 'Leke bakımı', 'Onarıcı krem', 'Çatlak bakımı', 'Atopik ve kuru cilt', 'Selülit bakımı'],
  'Yüz - Boyun Bakımı': ['Yüz kremi', 'Yüz bakım yağı', 'Yüz jeli', 'Yüz köpüğü', 'Yüz losyonu ve sütü', 'Yüz maskesi', 'Yüz serumu', 'Yüz toniği', 'Yüz bakım kapsülü', 'Termal su', 'Fondöten ve BB-CC krem', 'Pudra', 'Yüz sabunu ve şampuanı', 'Sakal serumu ve tıraş sonrası', 'Makyaj temizleme suyu, sütü ve köpüğü', 'Makyaj temizleme mendili', 'Yüz spreyi', 'Yüz tozu'],
  'Güneş Bakımı': ['Yüz güneş kremi', 'Vücut güneş losyonu', 'Çocuk güneş kremi', 'Renkli güneş kremi', 'Güneş sonrası', 'Bronzlaştırıcı']
};

// Ada bakarak tahmini kategori (otomatik siniflandirma onerisi). Ilk eslesen kural kazanir.
const DERMA_KURALLARI = [
  [/bebek|baby|pişik|pisik|emzik|biberon/, 'Anne & Bebek', (a) => (/pişik|pisik/.test(a) ? 'Pişik kremi' : /şampuan|sampuan|banyo|cleanser|wash/.test(a) ? 'Bebek şampuanı ve banyo' : /mendil/.test(a) ? 'Bebek ıslak mendil' : /güneş|gunes|spf|sun/.test(a) ? 'Bebek güneş kremi' : /emzik|biberon/.test(a) ? 'Emzik ve biberon' : 'Bebek losyonu ve yağı')],
  [/güneş|gunes|spf|sun\b|sunscreen|bronz|after sun/, 'Güneş Bakımı', (a) => (/after sun|güneş sonrası|gunes sonrasi/.test(a) ? 'Güneş sonrası' : /bronz/.test(a) ? 'Bronzlaştırıcı' : /çocuk|cocuk|kids/.test(a) ? 'Çocuk güneş kremi' : /renkli|tinted/.test(a) ? 'Renkli güneş kremi' : /vücut|vucut|body/.test(a) ? 'Vücut güneş losyonu' : 'Yüz güneş kremi')],
  [/şampuan|sampuan|shampoo|saç|sac\b|hair|kepek/, 'Saç Bakımı', (a) => (/kepek/.test(a) ? 'Kepeğe karşı' : /dökülme|dokulme|loss/.test(a) ? 'Dökülmeye karşı' : /kremi|conditioner/.test(a) ? 'Saç kremi' : /maske|mask/.test(a) ? 'Saç maskesi' : /serum|yağ|oil/.test(a) ? 'Saç serumu ve yağı' : /sprey|spray/.test(a) ? 'Saç spreyi' : 'Şampuan')],
  [/deodorant|roll-on|diş|dis macunu|ağız|agiz|gargara|duş|dus jeli|el kremi|dudak|lip|intim|ayak/, 'Kişisel Bakım', (a) => (/deodorant|roll-on/.test(a) ? 'Deodorant' : /diş macunu|dis macunu/.test(a) ? 'Diş macunu' : /diş fırçası|dis fircasi|ara yüz/.test(a) ? 'Diş fırçası ve ara yüz' : /ağız|agiz|gargara/.test(a) ? 'Ağız bakım suyu' : /duş|dus/.test(a) ? 'Duş jeli ve sabun' : /el kremi/.test(a) ? 'El kremi' : /dudak|lip/.test(a) ? 'Dudak bakımı' : /intim/.test(a) ? 'İntim bakım' : 'Ayak bakımı')],
  [/termal su|thermal|micellar|misel|\bh2o\b|makyaj temizleme|temizleme jeli|cleanser|\bjel\b|serum|tonik|toner|yüz|yuz|face|bb krem|cc krem|fondöten|fondoten|pudra|göz çevresi|goz cevresi/, 'Yüz - Boyun Bakımı', (a) => (/termal|thermal/.test(a) ? 'Termal su' : /micellar|misel|\bh2o\b|makyaj temizleme/.test(a) ? 'Makyaj temizleme suyu, sütü ve köpüğü' : /serum/.test(a) ? 'Yüz serumu' : /tonik|toner/.test(a) ? 'Yüz toniği' : /maske|mask/.test(a) ? 'Yüz maskesi' : /köpük|kopuk|foam/.test(a) ? 'Yüz köpüğü' : /jel|gel/.test(a) ? 'Yüz jeli' : /fondöten|fondoten|bb krem|cc krem/.test(a) ? 'Fondöten ve BB-CC krem' : /pudra/.test(a) ? 'Pudra' : 'Yüz kremi')],
  [/losyon|lotion|nemlendirici|krem|cream|akne|leke|çatlak|catlak|atopi|selülit|selulit|onarıcı|onarici|cicaplast|bariyer/, 'Cilt Bakımı', (a) => (/akne|sivilce/.test(a) ? 'Akneye eğilimli cilt' : /leke/.test(a) ? 'Leke bakımı' : /çatlak|catlak/.test(a) ? 'Çatlak bakımı' : /atopi|kuru cilt/.test(a) ? 'Atopik ve kuru cilt' : /selülit|selulit/.test(a) ? 'Selülit bakımı' : /onarıcı|onarici|cicaplast|bariyer/.test(a) ? 'Onarıcı krem' : /losyon|lotion|vücut|vucut|body/.test(a) ? 'Vücut losyonu' : 'Nemlendirici')]
];
function dermaTahmin(ad) {
  const a = kucuk(ad);
  for (const [desen, ana, alt] of DERMA_KURALLARI) if (desen.test(a)) return { ana, alt: alt(a) };
  return null;
}

module.exports = {
  urunAdiCoz, sadelestir, DERMA_AGACI, dermaTahmin, RENKLER, SEKILLER, CENTIKLER, KATILIM_ORANLARI, HASTA_ADLARI, yuvarla, kucuk, sayiOku, urlOku, listeOku, hastaMaliyeti };
