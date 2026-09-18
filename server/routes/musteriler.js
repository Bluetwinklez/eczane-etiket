const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { q } = req.query;
  if (q) {
    const like = `%${q}%`;
    return res.json(
      db
        .prepare(
          'SELECT * FROM musteriler WHERE ad_soyad LIKE ? OR telefon LIKE ? OR tc_no LIKE ? ORDER BY ad_soyad'
        )
        .all(like, like, like)
    );
  }
  res.json(db.prepare('SELECT * FROM musteriler ORDER BY ad_soyad').all());
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Musteri bulunamadi' });
  res.json(row);
});

router.get('/:id/satislar', (req, res) => {
  const musteri = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!musteri) return res.status(404).json({ error: 'Musteri bulunamadi' });
  const satislar = db
    .prepare('SELECT * FROM satislar WHERE musteri_id = ? ORDER BY tarih DESC')
    .all(req.params.id);
  res.json(satislar);
});

router.post('/', (req, res) => {
  const { ad_soyad, telefon, email, tc_no, adres } = req.body;
  if (!ad_soyad || !ad_soyad.trim()) return res.status(400).json({ error: 'Ad soyad zorunludur' });

  const info = db
    .prepare('INSERT INTO musteriler (ad_soyad, telefon, email, tc_no, adres) VALUES (?, ?, ?, ?, ?)')
    .run(ad_soyad.trim(), telefon || null, email || null, tc_no || null, adres || null);
  res.status(201).json(db.prepare('SELECT * FROM musteriler WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Musteri bulunamadi' });

  const { ad_soyad, telefon, email, tc_no, adres } = req.body;
  if (!ad_soyad || !ad_soyad.trim()) return res.status(400).json({ error: 'Ad soyad zorunludur' });

  db.prepare('UPDATE musteriler SET ad_soyad=?, telefon=?, email=?, tc_no=?, adres=? WHERE id=?').run(
    ad_soyad.trim(),
    telefon || null,
    email || null,
    tc_no || null,
    adres || null,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Musteri bulunamadi' });
  db.prepare('DELETE FROM musteriler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
