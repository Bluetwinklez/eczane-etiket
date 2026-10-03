const express = require('express');
const { db } = require('../db');
const { bildirimGonder } = require('../bildirim');

const router = express.Router();

router.get('/', (req, res) => {
  const { musteri_id, durum } = req.query;
  let sql = `
    SELECT b.*, m.ad_soyad AS musteri_adi
    FROM bildirimler b
    LEFT JOIN musteriler m ON m.id = b.musteri_id
    WHERE 1=1
  `;
  const params = [];
  if (musteri_id) {
    sql += ' AND b.musteri_id = ?';
    params.push(Number(musteri_id));
  }
  if (durum) {
    sql += ' AND b.durum = ?';
    params.push(durum);
  }
  sql += ' ORDER BY b.tarih DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', async (req, res) => {
  const { musteri_id, kanal, mesaj } = req.body;
  if (!musteri_id || !['email', 'sms'].includes(kanal) || !mesaj || !mesaj.trim()) {
    return res.status(400).json({ error: 'Musteri, kanal (email/sms) ve mesaj zorunludur' });
  }

  const musteri = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(musteri_id);
  if (!musteri) return res.status(404).json({ error: 'Musteri bulunamadi' });

  const sonuc = await bildirimGonder(musteri, kanal, mesaj.trim());
  res.status(201).json(sonuc);
});

module.exports = router;
