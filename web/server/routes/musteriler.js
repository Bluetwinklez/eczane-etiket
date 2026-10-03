const express = require('express');
const { db } = require('../db');
const { musteriBakiyesi } = require('../cari');

function limitOku(deger) {
  if (deger === undefined || deger === null || deger === '') return null;
  const n = Number(deger);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

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
  res.json({ ...row, veresiye_bakiyesi: musteriBakiyesi(row.id) });
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
  const { ad_soyad, telefon, email, tc_no, adres, saglik_notu } = req.body;
  if (!ad_soyad || !ad_soyad.trim()) return res.status(400).json({ error: 'Ad soyad zorunludur' });
  const limit = limitOku(req.body.veresiye_limiti);
  if (Number.isNaN(limit)) return res.status(400).json({ error: 'Gecersiz veresiye limiti' });

  const info = db
    .prepare('INSERT INTO musteriler (ad_soyad, telefon, email, tc_no, adres, saglik_notu, veresiye_limiti) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ad_soyad.trim(), telefon || null, email || null, tc_no || null, adres || null, saglik_notu || null, limit);
  res.status(201).json(db.prepare('SELECT * FROM musteriler WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Musteri bulunamadi' });

  const { ad_soyad, telefon, email, tc_no, adres, saglik_notu } = req.body;
  if (!ad_soyad || !ad_soyad.trim()) return res.status(400).json({ error: 'Ad soyad zorunludur' });
  // veresiye_limiti gonderilmezse mevcut deger korunur
  const limit = 'veresiye_limiti' in req.body ? limitOku(req.body.veresiye_limiti) : existing.veresiye_limiti;
  if (Number.isNaN(limit)) return res.status(400).json({ error: 'Gecersiz veresiye limiti' });

  db.prepare('UPDATE musteriler SET ad_soyad=?, telefon=?, email=?, tc_no=?, adres=?, saglik_notu=?, veresiye_limiti=? WHERE id=?').run(
    ad_soyad.trim(),
    telefon || null,
    email || null,
    tc_no || null,
    adres || null,
    saglik_notu || null,
    limit,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Musteri bulunamadi' });
  if (Math.abs(musteriBakiyesi(existing.id)) > 0.001) {
    return res.status(400).json({ error: 'Veresiye bakiyesi olan musteri silinemez' });
  }
  db.prepare('DELETE FROM musteriler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
