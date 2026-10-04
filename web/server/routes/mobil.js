const express = require('express');
const { db } = require('../db');
const { sqlSaatFarki, yerelSimdi } = require('../zaman');

const router = express.Router();

const yuvarla = (n) => Math.round((n || 0) * 100) / 100;
const gunStr = (d) => d.toISOString().slice(0, 10);
function gunEkle(tarih, gun) {
  const d = new Date(tarih + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + gun);
  return gunStr(d);
}
const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

// Donem araliklari yerel (Turkiye) takvimine gore: [baslangic, bitis] dahil, YYYY-MM-DD
function aralik(donem) {
  const bugun = gunStr(yerelSimdi());
  if (donem === 'hafta') return { bas: gunEkle(bugun, -6), bit: bugun, onceBas: gunEkle(bugun, -13), onceBit: gunEkle(bugun, -7) };
  if (donem === 'ay') {
    const bas = bugun.slice(0, 8) + '01';
    const oncekiAyBas = gunEkle(bas, -1).slice(0, 8) + '01';
    // Gecen ayin ayni gunune kadar kiyas (yarim ayi tam ayla kiyaslamamak icin)
    const gunSayisi = Number(bugun.slice(8, 10));
    const oncekiAySon = gunEkle(bas, -1);
    const onceBit = gunEkle(oncekiAyBas, gunSayisi - 1) > oncekiAySon ? oncekiAySon : gunEkle(oncekiAyBas, gunSayisi - 1);
    return { bas, bit: bugun, onceBas: oncekiAyBas, onceBit };
  }
  return { bas: bugun, bit: bugun, onceBas: gunEkle(bugun, -1), onceBit: gunEkle(bugun, -1) };
}

function ciroOzeti(subeId, bas, bit) {
  const fark = sqlSaatFarki();
  const s = db
    .prepare(
      `SELECT COUNT(*) AS adet, COALESCE(SUM(toplam_tutar), 0) AS toplam FROM satislar
       WHERE sube_id = ? AND date(tarih, ?) BETWEEN ? AND ?`
    )
    .get(subeId, fark, bas, bit);
  const k = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN i.receteli = 1 OR i.recete_turu IS NOT NULL THEN sk.ara_toplam END), 0) AS receteli,
              COALESCE(SUM(CASE WHEN i.receteli = 0 AND i.recete_turu IS NULL THEN sk.ara_toplam END), 0) AS recetesiz
       FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id JOIN ilaclar i ON i.id = sk.ilac_id
       WHERE sa.sube_id = ? AND date(sa.tarih, ?) BETWEEN ? AND ?`
    )
    .get(subeId, fark, bas, bit);
  return { adet: s.adet, toplam: yuvarla(s.toplam), receteli: yuvarla(k.receteli), recetesiz: yuvarla(k.recetesiz) };
}

// Cubuk grafik serisi: gun -> son 7 gun, hafta -> son 8 hafta, ay -> son 6 ay
function seri(subeId, donem) {
  const fark = sqlSaatFarki();
  const bugun = gunStr(yerelSimdi());
  const toplam = db.prepare(
    `SELECT COALESCE(SUM(toplam_tutar), 0) AS t FROM satislar WHERE sube_id = ? AND date(tarih, ?) BETWEEN ? AND ?`
  );
  const dilimler = [];
  if (donem === 'ay') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(bugun.slice(0, 8) + '01T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - i);
      const bas = gunStr(d);
      const son = new Date(d);
      son.setUTCMonth(son.getUTCMonth() + 1);
      son.setUTCDate(0);
      dilimler.push({ etiket: AY_KISA[d.getUTCMonth()], bas, bit: gunStr(son) });
    }
  } else if (donem === 'hafta') {
    for (let i = 7; i >= 0; i--) {
      const bit = gunEkle(bugun, -7 * i);
      const bas = gunEkle(bit, -6);
      dilimler.push({ etiket: `${Number(bas.slice(8))}/${Number(bas.slice(5, 7))}`, bas, bit });
    }
  } else {
    for (let i = 6; i >= 0; i--) {
      const g = gunEkle(bugun, -i);
      dilimler.push({ etiket: GUN_KISA[new Date(g + 'T12:00:00Z').getUTCDay()], bas: g, bit: g });
    }
  }
  return dilimler.map((d) => ({ etiket: d.etiket, bas: d.bas, bit: d.bit, toplam: yuvarla(toplam.get(subeId, fark, d.bas, d.bit).t) }));
}

router.get('/ozet', (req, res) => {
  const donem = ['gun', 'hafta', 'ay'].includes(req.query.donem) ? req.query.donem : 'gun';
  const subeId = req.user.sube_id;
  const a = aralik(donem);
  const simdi = ciroOzeti(subeId, a.bas, a.bit);
  const once = ciroOzeti(subeId, a.onceBas, a.onceBit);

  const subeler =
    req.user.rol === 'admin'
      ? db.prepare('SELECT id, ad FROM subeler ORDER BY id').all()
      : db.prepare('SELECT id, ad FROM subeler WHERE id = ?').all(subeId);
  const subeKartlari = subeler.map((s) => {
    const x = ciroOzeti(s.id, a.bas, a.bit);
    const y = ciroOzeti(s.id, a.onceBas, a.onceBit);
    return { id: s.id, ad: s.ad, toplam: x.toplam, fark: yuvarla(x.toplam - y.toplam) };
  });

  res.json({
    donem,
    aralik: a,
    ...simdi,
    onceki: once,
    kritik_stok: db
      .prepare(
        `SELECT COUNT(*) AS c FROM ilaclar i LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
         WHERE COALESCE(s.stok, 0) <= i.kritik_stok`
      )
      .get(subeId).c,
    skt_yakin: db
      .prepare(
        "SELECT COUNT(*) AS c FROM ilac_partileri WHERE sube_id = ? AND miktar > 0 AND skt IS NOT NULL AND skt <= date('now', '+30 days')"
      )
      .get(subeId).c,
    seri: seri(subeId, donem),
    subeler: subeKartlari
  });
});

module.exports = router;
module.exports.aralik = aralik;
