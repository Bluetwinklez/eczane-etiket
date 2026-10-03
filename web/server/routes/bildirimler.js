const express = require('express');
const nodemailer = require('nodemailer');
const { db } = require('../db');

const router = express.Router();

function smtpYapilandirilmisMi() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

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

  const insert = db.prepare(
    `INSERT INTO bildirimler (musteri_id, kanal, mesaj, durum) VALUES (?, ?, ?, 'bekliyor')`
  );
  const info = insert.run(musteri_id, kanal, mesaj.trim());
  const bildirimId = info.lastInsertRowid;

  if (kanal === 'email' && smtpYapilandirilmisMi() && musteri.email) {
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: musteri.email,
        subject: 'Eczanem Programi - Hatirlatma',
        text: mesaj.trim()
      });
      db.prepare(`UPDATE bildirimler SET durum='gonderildi' WHERE id=?`).run(bildirimId);
    } catch (err) {
      db.prepare(`UPDATE bildirimler SET durum='hata', hata_mesaji=? WHERE id=?`).run(
        String(err.message).slice(0, 500),
        bildirimId
      );
    }
  } else {
    // SMS icin gercek bir saglayici entegrasyonu bu ortamda mevcut degil; e-posta icin
    // SMTP ayari yoksa veya musterinin e-posta adresi yoksa da ayni sekilde simule edilir.
    db.prepare(`UPDATE bildirimler SET durum='simule' WHERE id=?`).run(bildirimId);
  }

  const sonuc = db.prepare('SELECT * FROM bildirimler WHERE id = ?').get(bildirimId);
  res.status(201).json(sonuc);
});

module.exports = router;
