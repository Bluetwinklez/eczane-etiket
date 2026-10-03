const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { sendCsv } = require('../export');

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

router.get('/', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const ay = req.query.ay || new Date().toISOString().slice(0, 7);

  let sql = `
    SELECT n.*, s.ad AS sube_adi
    FROM nobetler n
    LEFT JOIN subeler s ON s.id = n.sube_id
    WHERE n.tarih LIKE ?
  `;
  const params = [ay + '%'];
  if (subeId) {
    sql += ' AND n.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY n.tarih';
  res.json(db.prepare(sql).all(...params));
});

router.get('/export', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const ay = req.query.ay || new Date().toISOString().slice(0, 7);

  let sql = `
    SELECT n.tarih, s.ad AS sube_adi, n.notlar
    FROM nobetler n
    LEFT JOIN subeler s ON s.id = n.sube_id
    WHERE n.tarih LIKE ?
  `;
  const params = [ay + '%'];
  if (subeId) {
    sql += ' AND n.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY n.tarih';
  const rows = db.prepare(sql).all(...params);

  sendCsv(res, `nobetci-listesi-${ay}.csv`, rows, [
    { alan: 'tarih', baslik: 'Tarih' },
    { alan: 'sube_adi', baslik: 'Şube' },
    { alan: 'notlar', baslik: 'Not' }
  ]);
});

router.post('/', requireRole('admin', 'eczaci'), (req, res) => {
  const { tarih, notlar } = req.body;
  if (!tarih || !/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
    return res.status(400).json({ error: 'Gecerli bir tarih girin (YYYY-MM-DD)' });
  }

  try {
    const info = db
      .prepare('INSERT INTO nobetler (sube_id, tarih, notlar) VALUES (?, ?, ?)')
      .run(req.user.sube_id, tarih, notlar || null);
    res.status(201).json(db.prepare('SELECT * FROM nobetler WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu tarih icin zaten nobet kaydi var' });
    }
    res.status(500).json({ error: 'Nobet eklenemedi' });
  }
});

router.delete('/:id', requireRole('admin', 'eczaci'), (req, res) => {
  const mevcut = db.prepare('SELECT * FROM nobetler WHERE id = ?').get(req.params.id);
  if (!mevcut) return res.status(404).json({ error: 'Nobet kaydi bulunamadi' });
  db.prepare('DELETE FROM nobetler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
