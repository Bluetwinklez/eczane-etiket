const express = require('express');
const { db } = require('../db');
const { partileriEsitle } = require('../partiler');
const { TABLO_SIRASI, yedekVerisi, otomatikYedekAl, otomatikYedekleriListele, yedekDosyaYolu } = require('../yedek');
const B = require('../bulutYedek');
const path = require('path');
const fs = require('fs');

const router = express.Router();



router.get('/export', (req, res) => {
  const dosyaAdi = `eczanem-yedek-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
  res.json(yedekVerisi());
});

// Otomatik (zamanlanmis) yedekler: listeleme, hemen alma, indirme
router.get('/otomatik', (req, res) => {
  res.json(otomatikYedekleriListele());
});

router.post('/otomatik/simdi', (req, res) => {
  res.status(201).json(otomatikYedekAl({ zorla: true }));
});

router.get('/otomatik/:dosya', (req, res) => {
  const yol = yedekDosyaYolu(req.params.dosya);
  if (!yol) return res.status(404).json({ error: 'Yedek bulunamadı' });
  res.download(yol, req.params.dosya);
});

function geriYukle(tablolar) {
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

    // Parti icermeyen eski yedeklerde stoklar acilis partisine donusturulur
    partileriEsitle();
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
  } catch (err) {
    db.exec('ROLLBACK');
    db.exec('PRAGMA foreign_keys = ON');
    throw err;
  }
}

router.post('/import', (req, res) => {
  const { tablolar } = req.body;
  if (!tablolar || typeof tablolar !== 'object') {
    return res.status(400).json({ error: 'Geçersiz yedek dosyası' });
  }
  try {
    geriYukle(tablolar);
    res.json({ ok: true, mesaj: 'Yedek basariyla geri yuklendi' });
  } catch (err) {
    res.status(500).json({ error: 'Yedek geri yüklenemedi: ' + err.message });
  }
});

// Dosyayla geri yukleme: duz JSON, .json.gz ya da sifreli .eczam (sifre X-Yedek-Sifre basliginda)
router.post('/import-dosya', express.raw({ type: 'application/octet-stream', limit: '300mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Dosya gönderilmedi' });
  let veri;
  try {
    veri = JSON.parse(B.yedegiAc(req.body, req.get('x-yedek-sifre') ? decodeURIComponent(req.get('x-yedek-sifre')) : ''));
  } catch (err) {
    return res.status(400).json({ error: err.kullanici ? err.message : 'Geçersiz yedek dosyası' });
  }
  if (!veri || typeof veri.tablolar !== 'object') return res.status(400).json({ error: 'Geçersiz yedek dosyası' });
  try {
    geriYukle(veri.tablolar);
    res.json({ ok: true, mesaj: 'Yedek basariyla geri yuklendi', olusturma_tarihi: veri.olusturma_tarihi || null });
  } catch (err) {
    res.status(500).json({ error: 'Yedek geri yüklenemedi: ' + err.message });
  }
});

// Bulut yedegi (esitleme klasoru) ayarlari
router.get('/bulut', (req, res) => {
  const a = B.ayarlar();
  res.json({ ...B.disaAcik(a), adaylar: B.klasorAdaylari(), dosyalar: B.bulutYedekleri(a.klasor).slice(0, 10) });
});

router.put('/bulut', (req, res) => {
  const b = req.body || {};
  const yeni = {};
  if ('klasor' in b) {
    const k = String(b.klasor || '').trim();
    if (k && !path.isAbsolute(k)) return res.status(400).json({ error: 'Klasör tam yol olmalı (örn. C:\\Users\\Ad\\OneDrive\\Eczam Yedekleri)' });
    if (k) {
      try {
        fs.mkdirSync(k, { recursive: true });
        const deneme = path.join(k, '.eczam-yazma-denemesi');
        fs.writeFileSync(deneme, 'ok');
        fs.unlinkSync(deneme);
      } catch (err) {
        return res.status(400).json({ error: 'Klasöre yazılamıyor: ' + err.message });
      }
    }
    yeni.klasor = k;
  }
  if (b.sifre_kaldir) yeni.sifre = '';
  else if (b.sifre) {
    if (String(b.sifre).length < 8) return res.status(400).json({ error: 'Yedek şifresi en az 8 karakter olmalı' });
    yeni.sifre = String(b.sifre);
  }
  if ('sakla' in b) {
    const n = Number(b.sakla);
    if (!Number.isInteger(n) || n < 1 || n > 365) return res.status(400).json({ error: 'Saklanacak yedek sayısı 1-365 olmalı' });
    yeni.sakla = n;
  }
  if ('aktif' in b) yeni.aktif = Boolean(b.aktif);
  const a = B.ayarlariYaz(yeni);
  if (a.aktif && !a.klasor) {
    B.ayarlariYaz({ aktif: false });
    return res.status(400).json({ error: 'Önce bulut klasörünü seçin' });
  }
  res.json(B.disaAcik(a));
});

module.exports = router;
