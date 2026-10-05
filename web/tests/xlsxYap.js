// Testler icin minimal .xlsx uretici (zip "stored" + paylasilan metinler). Gercek dosya depoya konmaz.
const zlib = require('zlib');

function crc32(tampon) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(tampon);
  let c, crc = 0xffffffff;
  for (const b of tampon) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipYap(dosyalar) {
  const parcalar = [];
  const dizin = [];
  let konum = 0;
  for (const [ad, icerik] of Object.entries(dosyalar)) {
    const adTampon = Buffer.from(ad);
    const veri = Buffer.from(icerik);
    const crc = crc32(veri);
    const yerel = Buffer.alloc(30);
    yerel.writeUInt32LE(0x04034b50, 0);
    yerel.writeUInt16LE(20, 4);
    yerel.writeUInt32LE(crc, 14);
    yerel.writeUInt32LE(veri.length, 18);
    yerel.writeUInt32LE(veri.length, 22);
    yerel.writeUInt16LE(adTampon.length, 26);
    parcalar.push(yerel, adTampon, veri);
    const kayit = Buffer.alloc(46);
    kayit.writeUInt32LE(0x02014b50, 0);
    kayit.writeUInt16LE(20, 4);
    kayit.writeUInt16LE(20, 6);
    kayit.writeUInt32LE(crc, 16);
    kayit.writeUInt32LE(veri.length, 20);
    kayit.writeUInt32LE(veri.length, 24);
    kayit.writeUInt16LE(adTampon.length, 28);
    kayit.writeUInt32LE(konum, 42);
    dizin.push(kayit, adTampon);
    konum += 30 + adTampon.length + veri.length;
  }
  const dizinTampon = Buffer.concat(dizin);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0);
  son.writeUInt16LE(Object.keys(dosyalar).length, 8);
  son.writeUInt16LE(Object.keys(dosyalar).length, 10);
  son.writeUInt32LE(dizinTampon.length, 12);
  son.writeUInt32LE(konum, 16);
  return Buffer.concat([...parcalar, dizinTampon, son]);
}

const kacis = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sutunAdi = (i) => String.fromCharCode(65 + i);

// sayfalar: [{ ad, satirlar: [[...], ...] }]; metinler paylasilan tabloya yazilir
function xlsxYap(sayfalar) {
  const metinler = [];
  const idx = (m) => {
    let i = metinler.indexOf(m);
    if (i < 0) i = metinler.push(m) - 1;
    return i;
  };
  const dosyalar = {
    'xl/workbook.xml': `<workbook xmlns:r="x"><sheets>${sayfalar.map((s, i) => `<sheet name="${kacis(s.ad)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${sayfalar.map((s, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`
  };
  sayfalar.forEach((s, i) => {
    dosyalar[`xl/worksheets/sheet${i + 1}.xml`] = `<worksheet><sheetData>${s.satirlar
      .map(
        (r, ri) =>
          `<row r="${ri + 1}">${r
            .map((h, ci) => (h === '' || h == null ? '' : `<c r="${sutunAdi(ci)}${ri + 1}" t="s"><v>${idx(String(h))}</v></c>`))
            .join('')}</row>`
      )
      .join('')}</sheetData></worksheet>`;
  });
  dosyalar['xl/sharedStrings.xml'] = `<sst>${metinler.map((m) => `<si><t>${kacis(m)}</t></si>`).join('')}</sst>`;
  return zipYap(dosyalar);
}

module.exports = { xlsxYap, zipYap };
