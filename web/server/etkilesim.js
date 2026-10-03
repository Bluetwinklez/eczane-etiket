const { db } = require('./db');

const SEVIYE_SIRASI = { ciddi: 0, orta: 1, hafif: 2 };

// Alerji notlarinda sinif adi gecebilir; sinifin etken maddelerine genisletilir
const ALERJI_SINIFLARI = {
  penisilin: ['amoksisilin', 'ampisilin', 'penisilin', 'benzilpenisilin'],
  nsaii: ['ibuprofen', 'diklofenak', 'naproksen', 'asetilsalisilik asit'],
  aspirin: ['asetilsalisilik asit'],
  sulfonamid: ['sulfametoksazol']
};

function normallestir(metin) {
  return String(metin || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

function maddeleriAyir(etkenMadde) {
  return normallestir(etkenMadde)
    .split(/[,+;/]/)
    .map((m) => m.trim())
    .filter(Boolean);
}

function ciftAnahtari(a, b) {
  return a < b ? [a, b] : [b, a];
}

// urunler: [{ id, ad, etken_madde, kaynak }] — kaynak 'sepet' veya 'gecmis'
function etkilesimleriBul(urunler) {
  const kurallar = new Map();
  for (const k of db.prepare('SELECT * FROM etkilesimler').all()) {
    kurallar.set(`${k.madde_a}|${k.madde_b}`, k);
  }

  const ogeler = [];
  for (const u of urunler) {
    for (const madde of maddeleriAyir(u.etken_madde)) ogeler.push({ ...u, madde });
  }

  const etkilesimler = [];
  const mukerrer = [];
  const gorulen = new Set();
  for (let i = 0; i < ogeler.length; i++) {
    for (let j = i + 1; j < ogeler.length; j++) {
      const x = ogeler[i];
      const y = ogeler[j];
      if (x.id === y.id) continue;
      // Gecmis alimlarin kendi aralarindaki etkilesimler bu satisin konusu degil
      if (x.kaynak === 'gecmis' && y.kaynak === 'gecmis') continue;

      if (x.madde === y.madde) {
        const anahtar = `m|${x.madde}|${[x.id, y.id].sort().join('-')}`;
        if (!gorulen.has(anahtar)) {
          gorulen.add(anahtar);
          mukerrer.push({ madde: x.madde, urun_a: x.ad, urun_b: y.ad, kaynak: x.kaynak === 'gecmis' || y.kaynak === 'gecmis' ? 'gecmis' : 'sepet' });
        }
        continue;
      }
      const [a, b] = ciftAnahtari(x.madde, y.madde);
      const kural = kurallar.get(`${a}|${b}`);
      if (!kural) continue;
      const anahtar = `e|${a}|${b}|${[x.id, y.id].sort().join('-')}`;
      if (gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      etkilesimler.push({
        seviye: kural.seviye,
        madde_a: x.madde,
        madde_b: y.madde,
        urun_a: x.ad,
        urun_b: y.ad,
        aciklama: kural.aciklama,
        kaynak: x.kaynak === 'gecmis' || y.kaynak === 'gecmis' ? 'gecmis' : 'sepet'
      });
    }
  }
  etkilesimler.sort((p, q) => SEVIYE_SIRASI[p.seviye] - SEVIYE_SIRASI[q.seviye]);
  return { etkilesimler, mukerrer };
}

// Musterinin saglik notunda urunun etken maddesi veya alerji sinifi geciyor mu?
function alerjiKontrol(saglikNotu, urunler) {
  const not = normallestir(saglikNotu);
  if (!not) return [];
  const uyarilar = [];
  for (const u of urunler) {
    for (const madde of maddeleriAyir(u.etken_madde)) {
      if (not.includes(madde)) {
        uyarilar.push({ urun: u.ad, madde, eslesen: madde });
        continue;
      }
      for (const [sinif, maddeler] of Object.entries(ALERJI_SINIFLARI)) {
        if (maddeler.includes(madde) && not.includes(sinif)) {
          uyarilar.push({ urun: u.ad, madde, eslesen: sinif });
          break;
        }
      }
    }
  }
  return uyarilar;
}

module.exports = { etkilesimleriBul, alerjiKontrol, maddeleriAyir, ciftAnahtari, normallestir };
