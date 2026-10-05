// Bagimliliksiz minimal .xlsx okuyucu (zip + sharedStrings + sheet XML).
// npm'deki 'xlsx' paketi bilinen guvenlik aciklari tasidigi icin kullanilmaz.
// Yalnizca metin/sayi hucrelerini okur; bicim, formul ve grafikler yok sayilir.
const zlib = require('zlib');

const MAKS_DOSYA = 40 * 1024 * 1024; // acilmis tek dosya ust siniri (zip bombasina karsi)

function zipDosyalari(tampon) {
  // Central directory sonu (EOCD) imzasi 0x06054b50
  let eocd = -1;
  for (let i = tampon.length - 22; i >= Math.max(0, tampon.length - 65557); i--) {
    if (tampon.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Geçerli bir .xlsx (zip) dosyası değil');
  const adet = tampon.readUInt16LE(eocd + 10);
  let konum = tampon.readUInt32LE(eocd + 16);
  const dosyalar = new Map();
  for (let i = 0; i < adet; i++) {
    if (tampon.readUInt32LE(konum) !== 0x02014b50) throw new Error('Zip dizini bozuk');
    const yontem = tampon.readUInt16LE(konum + 10);
    const sikisik = tampon.readUInt32LE(konum + 20);
    const boyut = tampon.readUInt32LE(konum + 24);
    const adUzunluk = tampon.readUInt16LE(konum + 28);
    const ekUzunluk = tampon.readUInt16LE(konum + 30);
    const yorumUzunluk = tampon.readUInt16LE(konum + 32);
    const yerel = tampon.readUInt32LE(konum + 42);
    const ad = tampon.toString('utf8', konum + 46, konum + 46 + adUzunluk);
    dosyalar.set(ad, { yontem, sikisik, boyut, yerel });
    konum += 46 + adUzunluk + ekUzunluk + yorumUzunluk;
  }
  return dosyalar;
}

function dosyaOku(tampon, dosyalar, ad) {
  const d = dosyalar.get(ad);
  if (!d) return null;
  if (d.boyut > MAKS_DOSYA) throw new Error(`${ad} çok büyük`);
  const adUzunluk = tampon.readUInt16LE(d.yerel + 26);
  const ekUzunluk = tampon.readUInt16LE(d.yerel + 28);
  const bas = d.yerel + 30 + adUzunluk + ekUzunluk;
  const ham = tampon.subarray(bas, bas + d.sikisik);
  if (d.yontem === 0) return ham.toString('utf8');
  if (d.yontem === 8) return zlib.inflateRawSync(ham, { maxOutputLength: MAKS_DOSYA }).toString('utf8');
  throw new Error('Desteklenmeyen sıkıştırma yöntemi');
}

const XML_VARLIKLARI = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
function xmlCoz(s) {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_VARLIKLARI[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function paylasilanMetinler(xml) {
  if (!xml) return [];
  const liste = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let metin = '';
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) metin += t[1];
    liste.push(xmlCoz(metin));
  }
  return liste;
}

const sutunNo = (ref) => {
  let n = 0;
  for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

function sayfaSatirlari(xml, metinler) {
  const satirlar = [];
  for (const sm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const satir = [];
    for (const cm of sm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const nitelik = cm[1];
      const ref = (nitelik.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const tip = (nitelik.match(/\bt="([^"]+)"/) || [])[1];
      const v = cm[2] && (cm[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let deger = '';
      if (tip === 's' && v !== undefined) deger = metinler[Number(v)] ?? '';
      else if (tip === 'inlineStr') deger = xmlCoz(((cm[2] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
      else if (v !== undefined) deger = xmlCoz(v);
      satir[sutunNo(ref)] = deger;
    }
    if (satir.some((h) => h !== undefined && h !== '')) satirlar.push(Array.from(satir, (h) => (h === undefined ? '' : String(h).trim())));
  }
  return satirlar;
}

// Doner: [{ ad, satirlar: [[...], ...] }]
function xlsxOku(tampon) {
  const dosyalar = zipDosyalari(tampon);
  const wb = dosyaOku(tampon, dosyalar, 'xl/workbook.xml');
  if (!wb) throw new Error('Çalışma kitabı bulunamadı');
  const rels = dosyaOku(tampon, dosyalar, 'xl/_rels/workbook.xml.rels') || '';
  const hedefler = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = (m[1].match(/\bId="([^"]+)"/) || [])[1];
    const hedef = (m[1].match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && hedef) hedefler[id] = hedef.replace(/^\/?(xl\/)?/, 'xl/');
  }
  const metinler = paylasilanMetinler(dosyaOku(tampon, dosyalar, 'xl/sharedStrings.xml'));
  const sayfalar = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const ad = xmlCoz((m[1].match(/\bname="([^"]*)"/) || [])[1] || '');
    const rid = (m[1].match(/\br:id="([^"]+)"/) || [])[1];
    const yol = hedefler[rid];
    const xml = yol && dosyaOku(tampon, dosyalar, yol);
    if (xml) sayfalar.push({ ad, satirlar: sayfaSatirlari(xml, metinler) });
  }
  return sayfalar;
}

module.exports = { xlsxOku, zipDosyalari, dosyaOku };
