const express = require('express');
const { ayarOku, ayarYaz } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

// Isletme ayarlari: kasiyerin uygulayabilecegi en yuksek sepet indirimi
const VARSAYILAN = { kasiyer_indirim_limiti: 10 };

function isletmeAyarlari() {
  const ham = ayarOku('isletme_ayarlari');
  let kayitli = {};
  try {
    kayitli = ham ? JSON.parse(ham) : {};
  } catch (e) {
    kayitli = {};
  }
  return { ...VARSAYILAN, ...kayitli };
}

router.get('/', (req, res) => res.json(isletmeAyarlari()));

router.put('/', requireRole('admin'), (req, res) => {
  const limit = Number(req.body.kasiyer_indirim_limiti);
  if (!(Number.isFinite(limit) && limit >= 0 && limit <= 100)) {
    return res.status(400).json({ error: 'Kasiyer indirim limiti 0-100 arasında olmalı' });
  }
  const yeni = { ...isletmeAyarlari(), kasiyer_indirim_limiti: limit };
  ayarYaz('isletme_ayarlari', JSON.stringify(yeni));
  res.json(yeni);
});

module.exports = router;
module.exports.isletmeAyarlari = isletmeAyarlari;
