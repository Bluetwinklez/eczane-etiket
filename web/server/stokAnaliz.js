// Stok yeterlilik analizi: son 30 gunun net satis hizina (iadeler dusulur) gore her urunun
// stogunun kac gun yetecegini hesaplar. Akilli siparis ve akilli uyarilar ortak kullanir.
const { db } = require('./db');

const ANALIZ_GUN = 30;

function stokYeterlilik(subeId) {
  return db
    .prepare(
      `SELECT i.id AS ilac_id, i.ad, i.barkod, i.kritik_stok, i.alis_fiyati, COALESCE(s.stok, 0) AS stok,
              COALESCE((SELECT SUM(sk.adet) FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
                         WHERE sk.ilac_id = i.id AND sa.sube_id = ? AND sa.tarih >= datetime('now', '-${ANALIZ_GUN} days')), 0)
            - COALESCE((SELECT SUM(ik.adet) FROM iade_kalemleri ik JOIN iadeler ia ON ia.id = ik.iade_id
                         WHERE ik.ilac_id = i.id AND ia.sube_id = ? AND ia.stoga_alindi = 1
                           AND ia.tarih >= datetime('now', '-${ANALIZ_GUN} days')), 0) AS son_satis
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       ORDER BY i.ad`
    )
    .all(subeId, subeId, subeId)
    .map((r) => {
      const gunluk = Math.max(0, r.son_satis) / ANALIZ_GUN;
      return {
        ...r,
        son_satis: Math.max(0, r.son_satis),
        gunluk_ortalama: Math.round(gunluk * 100) / 100,
        yetecek_gun: gunluk > 0 ? Math.floor(r.stok / gunluk) : null
      };
    });
}

// Tek urun icin satis hizi ozeti: son 30 gunun net adedi, haftalik kirilim (eskiden yeniye 4 hafta),
// gunluk ortalama, stogun kac gun yetecegi ve son satis tarihi
function urunAnalizi(ilacId, subeId) {
  // SQLite 'now' kaydirmasi: pozitif gun gecmise, negatif gun gelecege (+tolerans) gider
  const kayma = (gun) => `${gun >= 0 ? '-' : '+'}${Math.abs(gun)} days`;
  const net = (gunBas, gunBit) => {
    const sat = db
      .prepare(
        `SELECT COALESCE(SUM(sk.adet), 0) AS t FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
         WHERE sk.ilac_id = ? AND sa.sube_id = ? AND sa.tarih >= datetime('now', ?) AND sa.tarih < datetime('now', ?)`
      )
      .get(ilacId, subeId, kayma(gunBas), kayma(gunBit)).t;
    const iade = db
      .prepare(
        `SELECT COALESCE(SUM(ik.adet), 0) AS t FROM iade_kalemleri ik JOIN iadeler ia ON ia.id = ik.iade_id
         WHERE ik.ilac_id = ? AND ia.sube_id = ? AND ia.stoga_alindi = 1 AND ia.tarih >= datetime('now', ?) AND ia.tarih < datetime('now', ?)`
      )
      .get(ilacId, subeId, kayma(gunBas), kayma(gunBit)).t;
    return Math.max(0, sat - iade);
  };
  const haftalar = [28, 21, 14, 7].map((bas) => net(bas, bas - 7));
  // 7 gun kaydirmasi icin bitis -0 gun: "now" kendisi, +1 dk toleransla son hafta dahil edilir
  haftalar[3] = net(7, -1);
  const son30 = net(ANALIZ_GUN, -1);
  const gunluk = Math.round((son30 / ANALIZ_GUN) * 100) / 100;
  const stok = (db.prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?').get(ilacId, subeId) || { stok: 0 }).stok;
  const sonSatis = db
    .prepare(
      `SELECT MAX(sa.tarih) AS t FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id WHERE sk.ilac_id = ? AND sa.sube_id = ?`
    )
    .get(ilacId, subeId).t;
  return {
    ilac_id: ilacId,
    stok,
    son_30_gun_satis: son30,
    gunluk_ortalama: gunluk,
    yetecek_gun: gunluk > 0 ? Math.floor(stok / gunluk) : null,
    haftalik: haftalar,
    son_satis: sonSatis || null
  };
}

module.exports = { ANALIZ_GUN, stokYeterlilik, urunAnalizi };
