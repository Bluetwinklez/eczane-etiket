const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/ekip', (req, res) => {
  const rows = db
    .prepare('SELECT id, ad_soyad, rol FROM kullanicilar WHERE sube_id = ? AND aktif = 1 ORDER BY ad_soyad')
    .all(req.user.sube_id);
  res.json(rows);
});

router.get('/', (req, res) => {
  const { durum } = req.query;
  let sql = `
    SELECT g.*, a.ad_soyad AS atanan_adi, o.ad_soyad AS olusturan_adi
    FROM gorevler g
    LEFT JOIN kullanicilar a ON a.id = g.atanan_kullanici_id
    LEFT JOIN kullanicilar o ON o.id = g.olusturan_kullanici_id
    WHERE g.sube_id = ?
  `;
  const params = [req.user.sube_id];
  if (durum) {
    sql += ' AND g.durum = ?';
    params.push(durum);
  }
  sql += " ORDER BY (g.durum = 'tamamlandi'), CASE g.oncelik WHEN 'yuksek' THEN 0 WHEN 'orta' THEN 1 ELSE 2 END, g.olusturma_tarihi DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { baslik, aciklama, atanan_kullanici_id, oncelik } = req.body;
  if (!baslik || !baslik.trim()) return res.status(400).json({ error: 'Başlık zorunludur' });
  if (oncelik && !['dusuk', 'orta', 'yuksek'].includes(oncelik)) {
    return res.status(400).json({ error: 'Geçersiz öncelik' });
  }

  const info = db
    .prepare(
      `INSERT INTO gorevler (sube_id, baslik, aciklama, atanan_kullanici_id, olusturan_kullanici_id, oncelik)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.sube_id, baslik.trim(), aciklama || null, atanan_kullanici_id || null, req.user.id, oncelik || 'orta');

  res.status(201).json(db.prepare('SELECT * FROM gorevler WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const mevcut = db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id);
  if (!mevcut) return res.status(404).json({ error: 'Görev bulunamadı' });

  const { baslik, aciklama, atanan_kullanici_id, oncelik, durum } = req.body;
  if (durum && !['bekliyor', 'tamamlandi'].includes(durum)) {
    return res.status(400).json({ error: 'Geçersiz durum' });
  }

  db.prepare(
    `UPDATE gorevler SET
       baslik = COALESCE(?, baslik),
       aciklama = ?,
       atanan_kullanici_id = ?,
       oncelik = COALESCE(?, oncelik),
       durum = COALESCE(?, durum),
       tamamlanma_tarihi = CASE WHEN ? = 'tamamlandi' THEN datetime('now') WHEN ? = 'bekliyor' THEN NULL ELSE tamamlanma_tarihi END
     WHERE id = ?`
  ).run(
    baslik ? baslik.trim() : null,
    aciklama !== undefined ? aciklama || null : mevcut.aciklama,
    atanan_kullanici_id !== undefined ? atanan_kullanici_id || null : mevcut.atanan_kullanici_id,
    oncelik || null,
    durum || null,
    durum || '',
    durum || '',
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const mevcut = db.prepare('SELECT * FROM gorevler WHERE id = ?').get(req.params.id);
  if (!mevcut) return res.status(404).json({ error: 'Görev bulunamadı' });
  db.prepare('DELETE FROM gorevler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
