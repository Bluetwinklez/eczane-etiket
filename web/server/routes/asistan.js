// Eczaci/personel icin ilac bilgi asistani (web ve mobil) + yonetici ayarlari.
const express = require('express');
const { ayarYaz } = require('../db');
const { requireRole } = require('../auth');
const asistan = require('../asistan');

const router = express.Router();

router.post('/sor', async (req, res) => {
  const soru = String((req.body && req.body.soru) || '').trim();
  if (!soru) return res.status(400).json({ error: 'Soru boş olamaz' });
  if (soru.length > 1000) return res.status(400).json({ error: 'Soru en fazla 1000 karakter olabilir' });
  const r = await asistan.cevapla({ kimlik: `web:${req.user.id}`, rol: 'eczaci', mesaj: soru, subeId: req.user.sube_id || 1 });
  res.json({ cevap: r.cevap, urunler: r.urunler, hata: Boolean(r.hata) });
});

router.get('/ayarlar', requireRole('admin', 'eczaci'), (req, res) => {
  res.json({
    ...asistan.ayarlar(),
    anthropic_hazir: Boolean(process.env.ANTHROPIC_API_KEY),
    whatsapp_hazir: Boolean(
      process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET
    )
  });
});

router.put('/ayarlar', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const yeni = { ...asistan.ayarlar() };
  if (b.aktif !== undefined) yeni.aktif = Boolean(b.aktif);
  if (b.musteri_notlarini_kullan !== undefined) yeni.musteri_notlarini_kullan = Boolean(b.musteri_notlarini_kullan);
  if (b.eczane_adi !== undefined) {
    const ad = String(b.eczane_adi).trim();
    if (!ad || ad.length > 80) return res.status(400).json({ error: 'Eczane adı 1-80 karakter olmalı' });
    yeni.eczane_adi = ad;
  }
  if (b.hasta_gunluk_limit !== undefined) {
    const n = Number(b.hasta_gunluk_limit);
    if (!Number.isInteger(n) || n < 1 || n > 500) return res.status(400).json({ error: 'Günlük limit 1-500 arasında olmalı' });
    yeni.hasta_gunluk_limit = n;
  }
  if (b.eczaci_telefonlari !== undefined) {
    if (!Array.isArray(b.eczaci_telefonlari) || b.eczaci_telefonlari.length > 50) {
      return res.status(400).json({ error: 'Eczacı telefonları liste olmalı (en fazla 50)' });
    }
    const tel = b.eczaci_telefonlari.map(asistan.telefonSade);
    if (tel.some((t) => !/^\d{11,15}$/.test(t))) return res.status(400).json({ error: 'Geçersiz telefon numarası' });
    yeni.eczaci_telefonlari = [...new Set(tel)];
  }
  ayarYaz('asistan_ayarlari', JSON.stringify(yeni));
  res.json(yeni);
});

module.exports = router;
