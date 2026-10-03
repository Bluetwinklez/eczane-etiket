// Ilac kutularindaki karekod (GS1 DataMatrix) cozucu.
// ITS karekodunda tipik alanlar: (01) GTIN, (21) seri no, (17) SKT, (10) parti no.
// Barkod okuyucular klavye gibi yazdigi icin GS (\x1d) ayirici bazen kaybolur;
// bu durumda degisken uzunluklu alanlar geri izleme (backtracking) ile ayrilir.

const GS = '\x1d';

const SABIT_UZUNLUK = { '01': 14, 11: 6, 15: 6, 17: 6 };
const DEGISKEN = new Set(['10', '21']);
const TARIH_AI = new Set(['11', '15', '17']);

function normallestir(ham) {
  let s = String(ham || '').trim();
  // Okuyucu sembol tanimlayicisi on eki (orn. ]d2 = GS1 DataMatrix)
  s = s.replace(/^\][A-Za-z]\d/, '');
  // Okuyucu ayarina gore GS farkli gorunebilir
  s = s.replace(/<GS>|\{GS\}|␝|\\x1d|\|/gi, GS);
  return s.replace(/^\x1d+/, '');
}

function tarihGecerliMi(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return false;
  const ay = Number(yymmdd.slice(2, 4));
  const gun = Number(yymmdd.slice(4, 6));
  return ay >= 1 && ay <= 12 && gun >= 0 && gun <= 31;
}

// YYMMDD -> YYYY-AA-GG; GS1'de gun "00" ayin son gunu demektir
function tarihCevir(yymmdd) {
  if (!tarihGecerliMi(yymmdd)) return null;
  const yil = 2000 + Number(yymmdd.slice(0, 2));
  const ay = Number(yymmdd.slice(2, 4));
  let gun = Number(yymmdd.slice(4, 6));
  if (gun === 0) gun = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  return `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
}

function alanGecerliMi(ai, deger) {
  if (ai === '01') return /^\d{14}$/.test(deger);
  if (TARIH_AI.has(ai)) return tarihGecerliMi(deger);
  return deger.length >= 1 && deger.length <= 20 && !deger.includes(GS);
}

// Geri izlemeli ayristirma: her AI en fazla bir kez gecebilir
function ayristir(s, kullanilan = {}) {
  if (s.length === 0) return kullanilan;
  if (s[0] === GS) return ayristir(s.slice(1), kullanilan);
  const ai = s.slice(0, 2);
  if (kullanilan[ai] !== undefined) return null;

  if (SABIT_UZUNLUK[ai]) {
    const deger = s.slice(2, 2 + SABIT_UZUNLUK[ai]);
    if (deger.length !== SABIT_UZUNLUK[ai] || !alanGecerliMi(ai, deger)) return null;
    return ayristir(s.slice(2 + deger.length), { ...kullanilan, [ai]: deger });
  }

  if (DEGISKEN.has(ai)) {
    const govde = s.slice(2);
    const gsIndex = govde.indexOf(GS);
    if (gsIndex !== -1) {
      const deger = govde.slice(0, gsIndex);
      if (!alanGecerliMi(ai, deger)) return null;
      return ayristir(govde.slice(gsIndex + 1), { ...kullanilan, [ai]: deger });
    }
    // GS yok: kalanin tamami gecerli ayrisana kadar en kisa bolmeden basla
    for (let uzunluk = 1; uzunluk <= Math.min(20, govde.length); uzunluk++) {
      const deger = govde.slice(0, uzunluk);
      const sonuc = ayristir(govde.slice(uzunluk), { ...kullanilan, [ai]: deger });
      if (sonuc) return sonuc;
    }
    return null;
  }
  return null;
}

function parantezliAyristir(s) {
  const alanlar = {};
  const re = /\((\d{2})\)([^(]*)/g;
  let m;
  let eslesen = '';
  while ((m = re.exec(s)) !== null) {
    alanlar[m[1]] = m[2].trim();
    eslesen += m[0];
  }
  if (eslesen.replace(/\s/g, '') !== s.replace(/\s/g, '')) return null;
  for (const [ai, deger] of Object.entries(alanlar)) {
    if ((SABIT_UZUNLUK[ai] || DEGISKEN.has(ai)) && !alanGecerliMi(ai, deger)) return null;
  }
  return alanlar;
}

function karekodCoz(ham) {
  const s = normallestir(ham);
  if (!s) return null;
  const alanlar = s.startsWith('(') ? parantezliAyristir(s) : ayristir(s);
  if (!alanlar || !alanlar['01']) return null;

  const gtin = alanlar['01'];
  return {
    gtin,
    // Turkiye'deki ilac barkodlari EAN-13; GTIN-14 basindaki 0 atilinca elde edilir
    barkod: gtin.startsWith('0') ? gtin.slice(1) : gtin,
    seri_no: alanlar['21'] || null,
    parti_no: alanlar['10'] || null,
    skt: alanlar['17'] ? tarihCevir(alanlar['17']) : null,
    uretim_tarihi: alanlar['11'] ? tarihCevir(alanlar['11']) : null
  };
}

module.exports = { karekodCoz, normallestir, GS };
