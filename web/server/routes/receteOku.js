// Recete okuma: fotograftan (tarayicida OCR) ya da yapistirilan metinden ilac kalemlerini katalogla eslestirir.
const express = require('express');
const { db } = require('../db');
const { receteyiCoz } = require('../receteOku');

const router = express.Router();

router.post('/', (req, res) => {
  const metin = String((req.body && req.body.metin) || '');
  if (metin.trim().length < 3) return res.status(400).json({ error: 'Reçete metni boş' });
  if (metin.length > 20000) return res.status(400).json({ error: 'Metin çok uzun' });
  const katalog = db
    .prepare(
      `SELECT i.id, i.ad, i.barkod, i.satis_fiyati, COALESCE(s.stok, 0) AS stok, 'katalog' AS kaynak
       FROM ilaclar i LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?`
    )
    .all(req.user.sube_id);
  // Katalogda olmayan aktif TITCK urunleri de aday olur (karttan kataloga eklenebilir)
  const titck = db
    .prepare(
      `SELECT NULL AS id, t.ad, t.barkod, NULL AS satis_fiyati, NULL AS stok, 'titck' AS kaynak
       FROM titck_ilaclar t WHERE t.durum = 'aktif' AND NOT EXISTS (SELECT 1 FROM ilaclar i WHERE i.barkod = t.barkod)`
    )
    .all();
  res.json(receteyiCoz(metin, katalog.concat(titck)));
});

module.exports = router;
