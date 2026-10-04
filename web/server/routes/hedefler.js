const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { sqlSaatFarki, yerelSimdi } = require('../zaman');

const router = express.Router();
const AY = /^\d{4}-(0[1-9]|1[0-2])$/;

// Ayin net cirosu: satislar - iadeler (yerel saate gore ay siniri)
function gerceklesen(subeId, ay) {
  const fark = sqlSaatFarki();
  const satis = db
    .prepare("SELECT COALESCE(SUM(toplam_tutar), 0) AS t FROM satislar WHERE sube_id = ? AND strftime('%Y-%m', tarih, ?) = ?")
    .get(subeId, fark, ay).t;
  const iade = db
    .prepare("SELECT COALESCE(SUM(toplam_tutar), 0) AS t FROM iadeler WHERE sube_id = ? AND strftime('%Y-%m', tarih, ?) = ?")
    .get(subeId, fark, ay).t;
  return Math.round((satis - iade) * 100) / 100;
}

function hedefDurumu(subeId, ay) {
  const hedef = db.prepare('SELECT hedef_tutar FROM satis_hedefleri WHERE sube_id = ? AND ay = ?').get(subeId, ay);
  const g = gerceklesen(subeId, ay);
  const simdi = yerelSimdi();
  const buAy = simdi.toISOString().slice(0, 7);
  const [yil, a] = ay.split('-').map(Number);
  const aydakiGun = new Date(Date.UTC(yil, a, 0)).getUTCDate();
  const kalanGun = ay === buAy ? aydakiGun - simdi.getUTCDate() + 1 : ay > buAy ? aydakiGun : 0;
  const durum = { ay, hedef: hedef ? hedef.hedef_tutar : null, gerceklesen: g, kalan_gun: kalanGun };
  if (hedef) {
    durum.yuzde = Math.round((g / hedef.hedef_tutar) * 1000) / 10;
    durum.kalan_tutar = Math.max(0, Math.round((hedef.hedef_tutar - g) * 100) / 100);
    durum.gunluk_gereken = kalanGun > 0 ? Math.round((durum.kalan_tutar / kalanGun) * 100) / 100 : null;
    // Bu ay icin: gecen gunlerin ortalamasiyla ay sonu tahmini
    if (ay === buAy) {
      const gecenGun = simdi.getUTCDate();
      durum.ay_sonu_tahmini = Math.round(((g / gecenGun) * aydakiGun) * 100) / 100;
    }
  }
  return durum;
}

router.get('/aktif', (req, res) => {
  res.json(hedefDurumu(req.user.sube_id, yerelSimdi().toISOString().slice(0, 7)));
});

// Son 12 ay
router.get('/', (req, res) => {
  const simdi = yerelSimdi();
  const aylar = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(simdi.getUTCFullYear(), simdi.getUTCMonth() - i, 1));
    aylar.push(d.toISOString().slice(0, 7));
  }
  res.json(aylar.map((ay) => hedefDurumu(req.user.sube_id, ay)));
});

router.put('/', requireRole('admin', 'eczaci'), (req, res) => {
  const { ay } = req.body;
  const hedef = Number(req.body.hedef_tutar);
  if (!AY.test(String(ay))) return res.status(400).json({ error: 'Ay YYYY-AA formatında olmalı' });
  if (req.body.hedef_tutar === null || req.body.hedef_tutar === '') {
    db.prepare('DELETE FROM satis_hedefleri WHERE sube_id = ? AND ay = ?').run(req.user.sube_id, ay);
    return res.json(hedefDurumu(req.user.sube_id, ay));
  }
  if (!(hedef > 0)) return res.status(400).json({ error: 'Hedef tutarı pozitif olmalı' });
  db.prepare(
    `INSERT INTO satis_hedefleri (sube_id, ay, hedef_tutar) VALUES (?, ?, ?)
     ON CONFLICT(sube_id, ay) DO UPDATE SET hedef_tutar = excluded.hedef_tutar`
  ).run(req.user.sube_id, ay, hedef);
  res.json(hedefDurumu(req.user.sube_id, ay));
});

module.exports = router;
