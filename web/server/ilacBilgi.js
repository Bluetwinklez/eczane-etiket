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

module.exports = { RENKLER, SEKILLER, CENTIKLER, KATILIM_ORANLARI, HASTA_ADLARI, yuvarla, kucuk, sayiOku, urlOku, listeOku, hastaMaliyeti };
