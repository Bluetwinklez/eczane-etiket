const express = require('express');
const { db } = require('../db');

const router = express.Router();

const TABLO_SIRASI = [
  'subeler',
  'kullanicilar',
  'ilaclar',
  'musteriler',
  'tedarikciler',
  'ilac_stok',
  'fiyat_gecmisi',
  'stok_hareketleri',
  'satislar',
  'satis_kalemleri',
  'bildirimler'
];

router.get('/export', (req, res) => {
  const veri = {};
  for (const tablo of TABLO_SIRASI) {
    veri[tablo] = db.prepare(`SELECT * FROM ${tablo}`).all();
  }

  const dosyaAdi = `eczanem-yedek-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
  res.json({ olusturma_tarihi: new Date().toISOString(), tablolar: veri });
});

router.post('/import', (req, res) => {
  const { tablolar } = req.body;
  if (!tablolar || typeof tablolar !== 'object') {
    return res.status(400).json({ error: 'Gecersiz yedek dosyasi' });
  }

  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    for (const tablo of [...TABLO_SIRASI].reverse()) {
      db.exec(`DELETE FROM ${tablo}`);
    }

    for (const tablo of TABLO_SIRASI) {
      const satirlar = tablolar[tablo];
      if (!Array.isArray(satirlar) || satirlar.length === 0) continue;

      const kolonlar = Object.keys(satirlar[0]);
      const yerTutucular = kolonlar.map(() => '?').join(', ');
      const insert = db.prepare(
        `INSERT INTO ${tablo} (${kolonlar.join(', ')}) VALUES (${yerTutucular})`
      );
      for (const satir of satirlar) {
        insert.run(...kolonlar.map((k) => satir[k]));
      }
    }

    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
    res.json({ ok: true, mesaj: 'Yedek basariyla geri yuklendi' });
  } catch (err) {
    db.exec('ROLLBACK');
    db.exec('PRAGMA foreign_keys = ON');
    res.status(500).json({ error: 'Yedek geri yuklenemedi: ' + err.message });
  }
});

module.exports = router;
