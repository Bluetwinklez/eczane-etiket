const express = require('express');
const { db } = require('../db');

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

const KATEGORILER = ['kira', 'fatura', 'maas', 'vergi', 'tedarik', 'diger'];

router.get('/', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { baslangic, bitis, kategori } = req.query;

  let sql = `
    SELECT g.*, s.ad AS sube_adi
    FROM giderler g
    LEFT JOIN subeler s ON s.id = g.sube_id
    WHERE 1=1
  `;
  const params = [];
  if (subeId) {
    sql += ' AND g.sube_id = ?';
    params.push(subeId);
  }
  if (baslangic) {
    sql += ' AND g.tarih >= ?';
    params.push(baslangic);
  }
  if (bitis) {
    sql += ' AND g.tarih <= ?';
    params.push(bitis);
  }
  if (kategori) {
    sql += ' AND g.kategori = ?';
    params.push(kategori);
  }
  sql += ' ORDER BY g.tarih DESC, g.id DESC LIMIT 500';

  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { kategori, aciklama, tutar, tarih } = req.body;
  if (!KATEGORILER.includes(kategori)) {
    return res.status(400).json({ error: 'Geçersiz gider kategorisi' });
  }
  const tutarSayi = Number(tutar);
  if (!Number.isFinite(tutarSayi) || tutarSayi <= 0) {
    return res.status(400).json({ error: 'Geçerli bir tutar girin' });
  }

  const info = db
    .prepare('INSERT INTO giderler (sube_id, kategori, aciklama, tutar, tarih) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.sube_id, kategori, aciklama || null, tutarSayi, tarih || new Date().toISOString().slice(0, 10));

  res.status(201).json(db.prepare('SELECT * FROM giderler WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const mevcut = db.prepare('SELECT * FROM giderler WHERE id = ?').get(req.params.id);
  if (!mevcut) return res.status(404).json({ error: 'Gider bulunamadı' });

  const { kategori, aciklama, tutar, tarih } = req.body;
  if (!KATEGORILER.includes(kategori)) {
    return res.status(400).json({ error: 'Geçersiz gider kategorisi' });
  }
  const tutarSayi = Number(tutar);
  if (!Number.isFinite(tutarSayi) || tutarSayi <= 0) {
    return res.status(400).json({ error: 'Geçerli bir tutar girin' });
  }

  db.prepare('UPDATE giderler SET kategori=?, aciklama=?, tutar=?, tarih=? WHERE id=?').run(
    kategori,
    aciklama || null,
    tutarSayi,
    tarih,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM giderler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const mevcut = db.prepare('SELECT * FROM giderler WHERE id = ?').get(req.params.id);
  if (!mevcut) return res.status(404).json({ error: 'Gider bulunamadı' });
  db.prepare('DELETE FROM giderler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
