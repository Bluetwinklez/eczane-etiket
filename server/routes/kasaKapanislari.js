const express = require('express');
const { db } = require('../db');

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

function gununOzeti(subeId, tarih) {
  const rows = db
    .prepare(
      `SELECT odeme_tipi, SUM(toplam_tutar) AS toplam
       FROM satislar
       WHERE sube_id = ? AND date(tarih) = ?
       GROUP BY odeme_tipi`
    )
    .all(subeId, tarih);

  const ozet = { nakit: 0, kart: 0, sgk: 0 };
  for (const r of rows) {
    if (r.odeme_tipi === 'nakit') ozet.nakit = r.toplam;
    else if (r.odeme_tipi === 'kredi_karti') ozet.kart = r.toplam;
    else if (r.odeme_tipi === 'sgk') ozet.sgk = r.toplam;
  }
  ozet.toplam = ozet.nakit + ozet.kart + ozet.sgk;
  const satisAdedi = db
    .prepare('SELECT COUNT(*) AS c FROM satislar WHERE sube_id = ? AND date(tarih) = ?')
    .get(subeId, tarih).c;
  ozet.satis_adedi = satisAdedi;
  return ozet;
}

router.get('/ozet', (req, res) => {
  const subeId = req.user.sube_id;
  const tarih = req.query.tarih || new Date().toISOString().slice(0, 10);
  const mevcutKapanis = db
    .prepare('SELECT * FROM kasa_kapanislari WHERE sube_id = ? AND tarih = ?')
    .get(subeId, tarih);
  res.json({ ...gununOzeti(subeId, tarih), tarih, zaten_kapatildi: Boolean(mevcutKapanis) });
});

router.get('/', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  let sql = `
    SELECT k.*, s.ad AS sube_adi, u.ad_soyad AS kapatan
    FROM kasa_kapanislari k
    LEFT JOIN subeler s ON s.id = k.sube_id
    LEFT JOIN kullanicilar u ON u.id = k.kullanici_id
    WHERE 1=1
  `;
  const params = [];
  if (subeId) {
    sql += ' AND k.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY k.tarih DESC LIMIT 90';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const subeId = req.user.sube_id;
  const tarih = req.body.tarih || new Date().toISOString().slice(0, 10);
  const nakitSayilan = Number(req.body.nakit_sayilan);
  if (!Number.isFinite(nakitSayilan) || nakitSayilan < 0) {
    return res.status(400).json({ error: 'Gecerli bir sayilan nakit tutari girin' });
  }

  const mevcut = db.prepare('SELECT id FROM kasa_kapanislari WHERE sube_id = ? AND tarih = ?').get(subeId, tarih);
  if (mevcut) {
    return res.status(409).json({ error: `${tarih} tarihi icin kasa zaten kapatilmis` });
  }

  const ozet = gununOzeti(subeId, tarih);
  const fark = Math.round((nakitSayilan - ozet.nakit) * 100) / 100;

  const info = db
    .prepare(
      `INSERT INTO kasa_kapanislari
       (sube_id, kullanici_id, tarih, nakit_sistem, kart_sistem, sgk_sistem, toplam_sistem, nakit_sayilan, fark, not_metni)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      subeId,
      req.user.id,
      tarih,
      ozet.nakit,
      ozet.kart,
      ozet.sgk,
      ozet.toplam,
      nakitSayilan,
      fark,
      req.body.not_metni || null
    );

  const kapanis = db.prepare('SELECT * FROM kasa_kapanislari WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(kapanis);
});

module.exports = router;
