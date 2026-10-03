const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM subeler ORDER BY ad').all());
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM subeler WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Sube bulunamadi' });
  res.json(row);
});

router.post('/', requireRole('admin'), (req, res) => {
  const { ad, adres, telefon } = req.body;
  if (!ad || !ad.trim()) return res.status(400).json({ error: 'Sube adi zorunludur' });

  const info = db.prepare('INSERT INTO subeler (ad, adres, telefon) VALUES (?, ?, ?)').run(
    ad.trim(),
    adres || null,
    telefon || null
  );

  const ilaclar = db.prepare('SELECT id FROM ilaclar').all();
  const insertStok = db.prepare('INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, 0)');
  for (const ilac of ilaclar) {
    insertStok.run(ilac.id, info.lastInsertRowid);
  }

  res.status(201).json(db.prepare('SELECT * FROM subeler WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM subeler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Sube bulunamadi' });

  const { ad, adres, telefon } = req.body;
  if (!ad || !ad.trim()) return res.status(400).json({ error: 'Sube adi zorunludur' });

  db.prepare('UPDATE subeler SET ad=?, adres=?, telefon=? WHERE id=?').run(
    ad.trim(),
    adres || null,
    telefon || null,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM subeler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM subeler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Sube bulunamadi' });
  try {
    db.prepare('DELETE FROM subeler WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(409).json({ error: 'Bu subeye ait satis veya kullanici kayitlari oldugu icin silinemedi' });
  }
});

module.exports = router;
