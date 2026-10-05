// Testler icin minimal eski Word (.doc) uretici: OLE2 kabuk + WordDocument (FIB + metin) + 1Table (parca tablosu).
// parcalar: [{ metin, sikistirilmis }] — sikistirilmis parca cp1252 tek bayt, digerleri UTF-16LE yazilir.
const SEKTOR = 512;
const SON = 0xfffffffe;
const BOS = 0xffffffff;
const FAT_SEKTORU = 0xfffffffd;

function dolgu(b, en = 4096) {
  const boy = Math.max(en, Math.ceil(b.length / SEKTOR) * SEKTOR);
  return Buffer.concat([b, Buffer.alloc(boy - b.length)]);
}

function docYap(parcalar) {
  const metinBas = 0x800;
  const metinler = [];
  const pcd = [];
  const cpler = [0];
  let konum = metinBas;
  let cp = 0;
  for (const p of parcalar) {
    const b = p.sikistirilmis ? Buffer.from(p.metin, 'latin1') : Buffer.from(p.metin, 'utf16le');
    pcd.push(p.sikistirilmis ? ((konum * 2) | 0x40000000) >>> 0 : konum);
    metinler.push(b);
    konum += b.length;
    cp += p.metin.length;
    cpler.push(cp);
  }
  const wd = Buffer.alloc(metinBas);
  wd.writeUInt16LE(0xa5ec, 0);
  wd.writeUInt16LE(0x0200, 0x0a); // 1Table
  const clx = Buffer.alloc(5 + cpler.length * 4 + pcd.length * 8);
  clx[0] = 0x02;
  clx.writeUInt32LE(clx.length - 5, 1);
  cpler.forEach((c, i) => clx.writeUInt32LE(c, 5 + i * 4));
  pcd.forEach((fc, i) => clx.writeUInt32LE(fc, 5 + cpler.length * 4 + i * 8 + 2));
  wd.writeUInt32LE(0, 0x1a2);
  wd.writeUInt32LE(clx.length, 0x1a6);
  const akislar = [
    ['WordDocument', dolgu(Buffer.concat([wd, ...metinler]))],
    ['1Table', dolgu(clx)]
  ];

  // Sektor yerlesimi: 0 = FAT, 1 = dizin, sonra akislar
  const fat = [FAT_SEKTORU, SON];
  const baslangiclar = [];
  let sira = 2;
  for (const [, veri] of akislar) {
    const n = veri.length / SEKTOR;
    baslangiclar.push(sira);
    for (let i = 0; i < n; i++) fat.push(i === n - 1 ? SON : sira + i + 1);
    sira += n;
  }
  if (fat.length > SEKTOR / 4) throw new Error('docYap: test belgesi çok büyük');
  const fatTampon = Buffer.alloc(SEKTOR, 0xff);
  fat.forEach((v, i) => fatTampon.writeUInt32LE(v >>> 0, i * 4));

  const dizin = Buffer.alloc(SEKTOR);
  const girdi = (i, ad, tip, bas, boy) => {
    const o = i * 128;
    dizin.write(ad, o, 'utf16le');
    dizin.writeUInt16LE((ad.length + 1) * 2, o + 64);
    dizin[o + 66] = tip;
    dizin.writeUInt32LE(BOS, o + 68);
    dizin.writeUInt32LE(BOS, o + 72);
    dizin.writeUInt32LE(BOS, o + 76);
    dizin.writeUInt32LE(bas >>> 0, o + 116);
    dizin.writeUInt32LE(boy, o + 120);
  };
  girdi(0, 'Root Entry', 5, SON, 0);
  akislar.forEach(([ad, veri], i) => girdi(i + 1, ad, 2, baslangiclar[i], veri.length));

  const baslik = Buffer.alloc(SEKTOR, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(baslik, 0);
  baslik.writeUInt16LE(0x3e, 0x18);
  baslik.writeUInt16LE(3, 0x1a);
  baslik.writeUInt16LE(0xfffe, 0x1c);
  baslik.writeUInt16LE(9, 0x1e);
  baslik.writeUInt16LE(6, 0x20);
  baslik.writeUInt32LE(1, 0x2c);
  baslik.writeUInt32LE(1, 0x30);
  baslik.writeUInt32LE(4096, 0x38);
  baslik.writeUInt32LE(SON, 0x3c);
  baslik.writeUInt32LE(SON, 0x44);
  for (let i = 0; i < 109; i++) baslik.writeUInt32LE(BOS, 0x4c + i * 4);
  baslik.writeUInt32LE(0, 0x4c);

  return Buffer.concat([baslik, fatTampon, dizin, ...akislar.map(([, v]) => v)]);
}

module.exports = { docYap };
