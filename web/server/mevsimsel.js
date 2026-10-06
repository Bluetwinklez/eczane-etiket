// Mevsimsel stok tahmini: onumuzdeki N gunun talebi, son N gun satisi x gecen yilin ayni donemdeki artis carpani.
// Gecen yil verisi yoksa Turkiye icin sezon takvimi (ATC / kategori / ad anahtar kelimeleri) yol gosterir.
const { db } = require('./db');
const { sqlSaatFarki } = require('./zaman');
const { sadelestir } = require('./ilacBilgi');

// aylar: 1-12; carpan: takvimden varsayilan artis
const SEZONLAR = [
  { ad: 'Soğuk algınlığı ve grip', aylar: [11, 12, 1, 2], carpan: 1.6, atc: ['R05', 'R01', 'R02', 'N02BE', 'M01AE01', 'J01CA', 'J01CR', 'R06AX'], kelime: ['grip', 'nezle', 'oksuruk', 'boğaz', 'bogaz', 'pastil', 'burun spreyi', 'deniz suyu', 'c vitamini', 'cinko', 'çinko', 'ates', 'ateş'] },
  { ad: 'Bahar alerjisi', aylar: [3, 4, 5], carpan: 1.5, atc: ['R06A', 'R01AD', 'S01GX', 'R03'], kelime: ['alerji', 'antihistamin', 'göz damlası', 'goz damlasi'] },
  { ad: 'Güneş ve sinek mevsimi', aylar: [5, 6, 7, 8], carpan: 1.8, atc: ['D04', 'D02BA', 'P03'], kelime: ['güneş', 'gunes', 'spf', 'sinek', 'böcek', 'bocek', 'sivrisinek', 'after sun', 'yanık', 'yanik'] },
  { ad: 'Yaz ishali ve sıvı kaybı', aylar: [6, 7, 8], carpan: 1.4, atc: ['A07', 'A06AD'], kelime: ['ishal', 'oral rehidrasyon', 'probiyotik', 'elektrolit'] },
  { ad: 'Okul dönemi ve bağışıklık', aylar: [9, 10], carpan: 1.3, atc: ['A11', 'A12', 'B03'], kelime: ['vitamin', 'multivitamin', 'omega', 'balık yağı', 'balik yagi', 'bitlenme', 'bit şampuan', 'bit sampuan'] }
];

const sade = (m) => sadelestir(m || '');

function sezonBul(urun, ay) {
  const atc = String(urun.atc_kodu || '').toUpperCase();
  const metin = sade(`${urun.ad} ${urun.kategori || ''} ${urun.derma_ana || ''} ${urun.derma_alt || ''}`);
  return SEZONLAR.filter((s) => s.aylar.includes(ay)).find(
    (s) => (atc && s.atc.some((on) => atc.startsWith(on))) || s.kelime.some((k) => metin.includes(sade(k)))
  );
}

const sinirla = (n, a, b) => Math.min(b, Math.max(a, n));

function mevsimselTahmin(subeId, { gun = 30, bugun = new Date() } = {}) {
  const fark = sqlSaatFarki();
  const t = (d) => d.toISOString().slice(0, 10);
  const gunEkle = (d, g) => new Date(d.getTime() + g * 86400000);
  // Pencereler bugunu de kapsar: sinir yarin 00:00
  const b = gunEkle(new Date(t(bugun) + 'T00:00:00Z'), 1);
  const pencereler = {
    son: [t(gunEkle(b, -gun)), t(b)],
    gy_onceki: [t(gunEkle(b, -365 - gun)), t(gunEkle(b, -365))],
    gy_sonraki: [t(gunEkle(b, -365)), t(gunEkle(b, -365 + gun))]
  };
  const satislar = db.prepare(
    `SELECT sk.ilac_id, SUM(sk.adet) AS adet FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
     WHERE sa.sube_id = ? AND date(sa.tarih, ?) >= ? AND date(sa.tarih, ?) < ? GROUP BY sk.ilac_id`
  );
  const harita = {};
  for (const [ad, [bas, bit]] of Object.entries(pencereler)) harita[ad] = new Map(satislar.all(subeId, fark, bas, fark, bit).map((r) => [r.ilac_id, r.adet]));

  const urunler = db
    .prepare(
      `SELECT i.id, i.ad, i.kategori, i.urun_tipi, COALESCE(s.stok, 0) AS stok, COALESCE(bi.atc_kodu, t.atc_kodu) AS atc_kodu, bi.derma_ana, bi.derma_alt
       FROM ilaclar i LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       LEFT JOIN ilac_bilgi bi ON bi.ilac_id = i.id LEFT JOIN titck_ilaclar t ON t.barkod = i.barkod`
    )
    .all(subeId);

  // Tahmin, onumuzdeki donemin agirlikli ayina gore (pencerenin ortasi)
  const ay = gunEkle(b, Math.floor(gun / 2)).getUTCMonth() + 1;
  const satirlar = [];
  for (const u of urunler) {
    const son = harita.son.get(u.id) || 0;
    const once = harita.gy_onceki.get(u.id) || 0;
    const sonra = harita.gy_sonraki.get(u.id) || 0;
    const sezon = sezonBul(u, ay);
    let carpan = 1;
    let kaynak = null;
    if (once + sonra >= 5) {
      carpan = sinirla((sonra + 1) / (once + 1), 0.5, 3);
      kaynak = 'gecen_yil';
    } else if (sezon) {
      carpan = sezon.carpan;
      kaynak = 'takvim';
    }
    let tahmin = Math.round(son * carpan);
    if (!son && kaynak === 'gecen_yil') tahmin = sonra;
    const oneri = Math.max(0, tahmin - u.stok);
    if (!tahmin || (carpan < 1.15 && !oneri)) continue;
    satirlar.push({
      id: u.id, ad: u.ad, kategori: u.kategori, stok: u.stok, son_satis: son, gecen_yil_onceki: once, gecen_yil_sonraki: sonra,
      carpan: Math.round(carpan * 100) / 100, tahmin, oneri, kaynak, sezon: sezon ? sezon.ad : null
    });
  }
  satirlar.sort((a, b2) => b2.oneri - a.oneri || b2.carpan - a.carpan);

  // Kategori bazinda gecen yilin ayni donem degisimi
  const kategoriler = new Map();
  for (const u of urunler) {
    const k = u.kategori || 'Diğer';
    const once = harita.gy_onceki.get(u.id) || 0;
    const sonra = harita.gy_sonraki.get(u.id) || 0;
    if (!once && !sonra) continue;
    const g = kategoriler.get(k) || { kategori: k, once: 0, sonra: 0 };
    g.once += once;
    g.sonra += sonra;
    kategoriler.set(k, g);
  }
  const kategoriListesi = [...kategoriler.values()]
    .filter((k) => k.once + k.sonra >= 5)
    .map((k) => ({ ...k, degisim: k.once ? Math.round(((k.sonra - k.once) / k.once) * 1000) / 10 : null }))
    .sort((a, b2) => (b2.degisim ?? 999) - (a.degisim ?? 999));

  return {
    gun,
    ay,
    pencereler,
    sezonlar: SEZONLAR.filter((s) => s.aylar.includes(ay)).map((s) => s.ad),
    kategoriler: kategoriListesi,
    urunler: satirlar
  };
}

module.exports = { mevsimselTahmin, sezonBul, SEZONLAR };
