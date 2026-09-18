const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { q } = req.query;
  if (q) {
    const like = `%${q}%`;
    return res.json(
      db
        .prepare('SELECT * FROM tedarikciler WHERE firma_adi LIKE ? OR yetkili LIKE ? ORDER BY firma_adi')
        .all(like, like)
    );
  }
  res.json(db.prepare('SELECT * FROM tedarikciler ORDER BY firma_adi').all());
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Tedarikci bulunamadi' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { firma_adi, yetkili, telefon, email } = req.body;
  if (!firma_adi || !firma_adi.trim()) return res.status(400).json({ error: 'Firma adi zorunludur' });

  const info = db
    .prepare('INSERT INTO tedarikciler (firma_adi, yetkili, telefon, email) VALUES (?, ?, ?, ?)')
    .run(firma_adi.trim(), yetkili || null, telefon || null, email || null);
  res.status(201).json(db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tedarikci bulunamadi' });

  const { firma_adi, yetkili, telefon, email } = req.body;
  if (!firma_adi || !firma_adi.trim()) return res.status(400).json({ error: 'Firma adi zorunludur' });

  db.prepare('UPDATE tedarikciler SET firma_adi=?, yetkili=?, telefon=?, email=? WHERE id=?').run(
    firma_adi.trim(),
    yetkili || null,
    telefon || null,
    email || null,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tedarikci bulunamadi' });
  db.prepare('DELETE FROM tedarikciler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
