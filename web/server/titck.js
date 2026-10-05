// TITCK (Turkiye Ilac ve Tibbi Cihaz Kurumu) "SKRS e-Recete Ilac ve Diger Farmasotik Urunler Listesi" ayristirici.
// Liste herkese aciktir (titck.gov.tr). Dosya eczane tarafindan yuklenir ya da asagidaki indirici ile alinir.
const { xlsxOku } = require('./xlsxOku');

const ATC_ANA_GRUPLARI = {
  A: 'Sindirim sistemi ve metabolizma',
  B: 'Kan ve kan yapıcı organlar',
  C: 'Kardiyovasküler sistem',
  D: 'Dermatolojikler',
  G: 'Genitoüriner sistem ve cinsiyet hormonları',
  H: 'Sistemik hormonal preparatlar',
  J: 'Sistemik enfeksiyon ilaçları',
  L: 'Antineoplastik ve immünomodülatör ajanlar',
  M: 'Kas-iskelet sistemi',
  N: 'Sinir sistemi',
  P: 'Antiparaziter ürünler',
  R: 'Solunum sistemi',
  S: 'Duyu organları',
  V: 'Çeşitli'
};
const RECETE_ESLEME = { normal: null, kırmızı: 'kirmizi', yeşil: 'yesil', mor: 'mor', turuncu: 'turuncu' };

const anahtar = (m) =>
  String(m || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
const bosluk = (m) => String(m || '').replace(/\s+/g, ' ').trim();

function atcAnaGrup(atc) {
  return ATC_ANA_GRUPLARI[String(atc || '').charAt(0).toUpperCase()] || null;
}

// Doner: { kayitlar: [...], liste_tarihi } ya da { hata }
function listeyiCoz(tampon) {
  let sayfalar;
  try {
    sayfalar = xlsxOku(tampon);
  } catch (err) {
    return { hata: 'Dosya okunamadı: ' + err.message };
  }
  const kayitlar = new Map();
  let listeTarihi = null;
  for (const sayfa of sayfalar) {
    const ad = anahtar(sayfa.ad);
    // "Listeye yeni eklenen" ve "degisiklik yapilan" sayfalari aktif listenin parcasidir; yok sayilir
    let durum = null;
    if (ad.startsWith('aktif')) durum = 'aktif';
    else if (ad.startsWith('pasifealinacak')) durum = 'pasife_alinacak';
    else if (ad.startsWith('pasif')) durum = 'pasif';
    if (!durum) continue;

    const baslikIdx = sayfa.satirlar.findIndex((r) => r.some((h) => anahtar(h) === 'barkod'));
    if (baslikIdx < 0) continue;
    const kolon = {};
    sayfa.satirlar[baslikIdx].forEach((h, i) => {
      const k = anahtar(h);
      if (k === 'ilacadi') kolon.ad = i;
      else if (k === 'barkod') kolon.barkod = i;
      else if (k === 'atckodu') kolon.atc = i;
      else if (k === 'atcadi') kolon.atcAdi = i;
      else if (k === 'firmaadi') kolon.firma = i;
      else if (k.startsWith('recete')) kolon.recete = i;
      else if (k.startsWith('temelilaclistesi')) kolon.temel = i;
    });
    if (kolon.ad === undefined || kolon.barkod === undefined) continue;
    if (durum === 'aktif' && !listeTarihi) {
      const baslik = sayfa.satirlar.slice(0, baslikIdx).flat().join(' ');
      const m = baslik.match(/\((\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
      if (m) listeTarihi = m[2].split('.').reverse().join('-');
    }
    for (const r of sayfa.satirlar.slice(baslikIdx + 1)) {
      const barkod = String(r[kolon.barkod] || '').replace(/\D/g, '');
      if (!/^\d{8,14}$/.test(barkod) || !r[kolon.ad]) continue;
      const recete = bosluk(r[kolon.recete]).toLocaleLowerCase('tr-TR');
      // Ayni barkod hem aktif hem pasif sayfada gorunurse aktif sayilir
      if (kayitlar.has(barkod) && kayitlar.get(barkod).durum === 'aktif') continue;
      kayitlar.set(barkod, {
        barkod,
        ad: bosluk(r[kolon.ad]),
        atc_kodu: bosluk(r[kolon.atc]).toUpperCase() || null,
        atc_adi: bosluk(r[kolon.atcAdi]) || null,
        firma: bosluk(r[kolon.firma]) || null,
        recete_turu: Object.prototype.hasOwnProperty.call(RECETE_ESLEME, recete) ? RECETE_ESLEME[recete] : null,
        durum,
        temel_ilac: Number(r[kolon.temel]) > 0 ? 1 : 0
      });
    }
  }
  if (!kayitlar.size) return { hata: 'Dosyada TİTCK ilaç listesi bulunamadı (Aktif / Pasif ürünler sayfaları beklenir)' };
  return { kayitlar: [...kayitlar.values()], liste_tarihi: listeTarihi };
}

// Yalnizca titck.gov.tr alan adindan indirir (baska adrese yonlendirme/SSRF yok)
const IZINLI_ALAN = /(^|\.)titck\.gov\.tr$/i;
const LISTE_SAYFASI = 'https://www.titck.gov.tr/dinamikmodul/43';

async function sonListeyiIndir(fetchFn = fetch) {
  const istek = async (url) => {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !IZINLI_ALAN.test(u.hostname)) throw new Error('Yalnızca titck.gov.tr adresinden indirilebilir');
    const yanit = await fetchFn(u, { redirect: 'error', signal: AbortSignal.timeout(90000) });
    if (!yanit.ok) throw new Error(`TİTCK sitesi ${yanit.status} döndürdü`);
    return yanit;
  };
  const sayfa = await (await istek(LISTE_SAYFASI)).text();
  const baglanti = [...sayfa.matchAll(/href="([^"]+\.xlsx)"/gi)].map((m) => m[1]).find((h) => /AKLST/i.test(h)) || (sayfa.match(/href="([^"]+\.xlsx)"/i) || [])[1];
  if (!baglanti) throw new Error('TİTCK sayfasında liste bağlantısı bulunamadı');
  const yanit = await istek(new URL(baglanti, LISTE_SAYFASI).href);
  const tampon = Buffer.from(await yanit.arrayBuffer());
  if (tampon.length > 40 * 1024 * 1024) throw new Error('Dosya beklenenden büyük');
  return tampon;
}

module.exports = { ATC_ANA_GRUPLARI, atcAnaGrup, listeyiCoz, sonListeyiIndir, bosluk };
