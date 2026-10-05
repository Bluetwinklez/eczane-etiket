// Eski Word (.doc, Word 97-2003) dosyasindan duz metin ve tablo satirlari cikarir.
// Bagimlilik yok: OLE2 (Compound File) kabuk + WordDocument parca tablosu (CLX).
// SGK'nin EK-4D / EK-4F listeleri bu bicimde yayimlaniyor.

const IMZA = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const SON = 0xfffffffe;
const BOS = 0xffffffff;

function hata(m) {
  const e = new Error(m);
  e.kullaniciHatasi = true;
  return e;
}

// cp1252 (Word'un "sikistirilmis" metni) 0x80-0x9F araligi.
const CP1252 = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

function bilesikDosya(buf) {
  if (buf.length < 512 || !buf.subarray(0, 8).equals(IMZA)) throw hata('Dosya eski Word (.doc) biçiminde değil');
  const sektorBoyu = 1 << buf.readUInt16LE(0x1e);
  const miniBoyu = 1 << buf.readUInt16LE(0x20);
  const fatSayisi = buf.readUInt32LE(0x2c);
  const dizinBas = buf.readUInt32LE(0x30);
  const miniSinir = buf.readUInt32LE(0x38);
  const miniFatBas = buf.readUInt32LE(0x3c);
  let difatBas = buf.readUInt32LE(0x44);
  const difatSayisi = buf.readUInt32LE(0x48);
  const sektorSayisi = Math.floor((buf.length - sektorBoyu) / sektorBoyu) + 1;

  const sektor = (n) => {
    const bas = (n + 1) * sektorBoyu;
    if (n >= sektorSayisi + 1 || bas + sektorBoyu > buf.length + sektorBoyu) throw hata('Word dosyası bozuk (sektör)');
    return buf.subarray(bas, Math.min(bas + sektorBoyu, buf.length));
  };

  const fatSektorleri = [];
  for (let i = 0; i < 109 && fatSektorleri.length < fatSayisi; i++) fatSektorleri.push(buf.readUInt32LE(0x4c + i * 4));
  for (let d = 0; d < difatSayisi && difatBas !== SON && difatBas !== BOS; d++) {
    const s = sektor(difatBas);
    const adet = sektorBoyu / 4 - 1;
    for (let i = 0; i < adet && fatSektorleri.length < fatSayisi; i++) fatSektorleri.push(s.readUInt32LE(i * 4));
    difatBas = s.readUInt32LE(adet * 4);
  }
  const fat = [];
  for (const fs of fatSektorleri) {
    const s = sektor(fs);
    for (let i = 0; i + 4 <= s.length; i += 4) fat.push(s.readUInt32LE(i));
  }

  const zincir = (bas, tablo, sinir) => {
    const liste = [];
    const gorulen = new Set();
    for (let n = bas; n !== SON && n !== BOS; n = tablo[n]) {
      if (n === undefined || gorulen.has(n) || liste.length > sinir) throw hata('Word dosyası bozuk (zincir)');
      gorulen.add(n);
      liste.push(n);
    }
    return liste;
  };
  const akisOku = (bas) => Buffer.concat(zincir(bas, fat, fat.length).map(sektor));

  const dizinVeri = akisOku(dizinBas);
  const girdiler = [];
  for (let i = 0; i + 128 <= dizinVeri.length; i += 128) {
    const adUzun = dizinVeri.readUInt16LE(i + 64);
    if (!adUzun) continue;
    girdiler.push({
      ad: dizinVeri.subarray(i, i + Math.max(0, adUzun - 2)).toString('utf16le'),
      tip: dizinVeri[i + 66],
      bas: dizinVeri.readUInt32LE(i + 116),
      boy: dizinVeri.readUInt32LE(i + 120),
    });
  }
  const kok = girdiler.find((g) => g.tip === 5);
  let miniAkis = null;
  let miniFat = null;
  const miniHazirla = () => {
    if (miniAkis) return;
    miniAkis = kok ? akisOku(kok.bas) : Buffer.alloc(0);
    miniFat = [];
    if (miniFatBas !== SON && miniFatBas !== BOS) {
      const v = akisOku(miniFatBas);
      for (let i = 0; i + 4 <= v.length; i += 4) miniFat.push(v.readUInt32LE(i));
    }
  };

  return {
    akis(ad) {
      const g = girdiler.find((x) => x.tip === 2 && x.ad === ad);
      if (!g) return null;
      if (g.boy < miniSinir) {
        miniHazirla();
        const parcalar = zincir(g.bas, miniFat, miniFat.length).map((n) => miniAkis.subarray(n * miniBoyu, (n + 1) * miniBoyu));
        return Buffer.concat(parcalar).subarray(0, g.boy);
      }
      return akisOku(g.bas).subarray(0, g.boy);
    },
  };
}

// Word belgesinin ham metni: \r paragraf, \x07 hucre/satir sonu.
function wordMetni(buf) {
  const cf = bilesikDosya(buf);
  const wd = cf.akis('WordDocument');
  if (!wd || wd.length < 0x1aa) throw hata('Word belgesi okunamadı (WordDocument yok)');
  if (wd.readUInt16LE(0) !== 0xa5ec) throw hata('Word belgesi tanınmadı (FIB)');
  const bayrak = wd.readUInt16LE(0x0a);
  if (bayrak & 0x0100) throw hata('Şifreli Word belgesi okunamaz');
  const tablo = cf.akis(bayrak & 0x0200 ? '1Table' : '0Table');
  if (!tablo) throw hata('Word belgesi okunamadı (tablo akışı yok)');
  const fcClx = wd.readUInt32LE(0x1a2);
  const lcbClx = wd.readUInt32LE(0x1a6);
  if (!lcbClx || fcClx + lcbClx > tablo.length) throw hata('Word belgesi okunamadı (CLX)');

  let p = fcClx;
  const son = fcClx + lcbClx;
  while (p < son && tablo[p] === 0x01) p += 3 + tablo.readUInt16LE(p + 1);
  if (tablo[p] !== 0x02) throw hata('Word belgesi okunamadı (parça tablosu)');
  const lcb = tablo.readUInt32LE(p + 1);
  const plc = p + 5;
  const n = (lcb - 4) / 12;
  if (!Number.isInteger(n) || n < 1) throw hata('Word belgesi okunamadı (parça sayısı)');

  const parcalar = [];
  for (let i = 0; i < n; i++) {
    const cp1 = tablo.readUInt32LE(plc + i * 4);
    const cp2 = tablo.readUInt32LE(plc + (i + 1) * 4);
    const pcd = plc + (n + 1) * 4 + i * 8;
    let fc = tablo.readUInt32LE(pcd + 2);
    const adet = cp2 - cp1;
    if (adet <= 0) continue;
    if (fc & 0x40000000) {
      fc = (fc & 0x3fffffff) / 2;
      const b = wd.subarray(fc, fc + adet);
      let s = '';
      for (const c of b) s += c >= 0x80 && c <= 0x9f ? CP1252[c] || '' : String.fromCharCode(c);
      parcalar.push(s);
    } else {
      parcalar.push(wd.subarray(fc, fc + adet * 2).toString('utf16le'));
    }
  }
  return alanlariTemizle(parcalar.join(''));
}

// Alan kodlarini at (\x13 kod \x14 sonuc \x15 → sonuc), ozel karakterleri sadelestir.
function alanlariTemizle(m) {
  let cikti = '';
  const yigin = [];
  for (const ch of m) {
    if (ch === '\x13') { yigin.push('kod'); continue; }
    if (ch === '\x14') { if (yigin.length) yigin[yigin.length - 1] = 'sonuc'; continue; }
    if (ch === '\x15') { yigin.pop(); continue; }
    if (yigin.length && yigin[yigin.length - 1] === 'kod') continue;
    if (ch === '\x0b') cikti += '\n';
    else if (ch === '\x0c' || ch === '\x01' || ch === '\x08') continue;
    else if (ch === '\x1e') cikti += '-';
    else if (ch === '\x1f') continue;
    else if (ch === '\xa0') cikti += ' ';
    else cikti += ch;
  }
  return cikti;
}

// Tablo satirlari: her hucre \x07 ile biter, satir sonu ayrica bir \x07 ile isaretlenir.
// Donus: [[hucre, hucre, ...], ...] (tablo disindaki paragraflar tek hucreli satir olarak gelmez).
function wordTablolari(buf) {
  const metin = wordMetni(buf);
  const satirlar = [];
  let hucreler = [];
  let hucre = '';
  let oncekiHucreSonu = false;
  for (const ch of metin) {
    if (ch === '\x07') {
      if (oncekiHucreSonu && hucre === '') {
        if (hucreler.length) satirlar.push(hucreler);
        hucreler = [];
        oncekiHucreSonu = false;
        continue;
      }
      hucreler.push(hucre.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim());
      hucre = '';
      oncekiHucreSonu = true;
      continue;
    }
    if (ch === '\r' && !hucreler.length && hucre === '') { oncekiHucreSonu = false; continue; }
    if (ch === '\r' && !hucreler.length) {
      // tablo disi paragraf
      hucre = '';
      oncekiHucreSonu = false;
      continue;
    }
    hucre += ch;
    oncekiHucreSonu = false;
  }
  return satirlar;
}

module.exports = { wordMetni, wordTablolari, bilesikDosya };
