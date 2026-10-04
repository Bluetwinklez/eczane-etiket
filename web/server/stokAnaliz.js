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

module.exports = { ANALIZ_GUN, stokYeterlilik };
