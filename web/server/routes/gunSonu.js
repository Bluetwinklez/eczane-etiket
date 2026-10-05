// Gun sonu ozeti e-postasi: ayar, onizleme ve hemen gonderme
const express = require('express');
const { requireRole } = require('../auth');
const G = require('../gunSonuOzeti');
const { smtpYapilandirilmisMi } = require('../bildirim');
const { yerelSimdi } = require('../zaman');

const router = express.Router();
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/ayar', requireRole('admin'), (req, res) => res.json({ ...G.ayarlariOku(), smtp: smtpYapilandirilmisMi() }));

router.put('/ayar', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const yeni = {};
  if ('aktif' in b) yeni.aktif = Boolean(b.aktif);
  if ('adres' in b) {
    const adres = String(b.adres || '').trim();
    if (adres && !adres.split(/[,;]\s*/).every((x) => EPOSTA.test(x))) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin (birden fazlaysa virgülle ayırın)' });
    yeni.adres = adres;
  }
  if ('saat' in b) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.saat))) return res.status(400).json({ error: 'Saat SS:DD biçiminde olmalı' });
    yeni.saat = b.saat;
  }
  const a = G.ayarlariYaz(yeni);
  if (a.aktif && !a.adres) return res.status(400).json({ error: 'Otomatik gönderim için e-posta adresi girin' });
  res.json({ ...a, smtp: smtpYapilandirilmisMi() });
});

router.get('/onizleme', requireRole('admin', 'eczaci'), (req, res) => {
  const tarih = TARIH.test(String(req.query.tarih || '')) ? req.query.tarih : yerelSimdi().toISOString().slice(0, 10);
  const ozet = G.ozetOlustur(req.user.sube_id, tarih);
  res.json({ ozet, ...G.epostaIcerigi(ozet) });
});

router.post('/gonder', requireRole('admin'), async (req, res) => {
  const a = G.ayarlariOku();
  const adres = String((req.body && req.body.adres) || a.adres || '').trim();
  if (!adres) return res.status(400).json({ error: 'E-posta adresi girilmemiş' });
  const tarih = yerelSimdi().toISOString().slice(0, 10);
  const sonuc = await G.gonder(adres, G.epostaIcerigi(G.ozetOlustur(req.user.sube_id, tarih)));
  res.status(sonuc.durum === 'hata' ? 502 : 200).json(sonuc);
});

module.exports = router;
