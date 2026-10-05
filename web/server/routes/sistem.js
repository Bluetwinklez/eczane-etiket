const express = require('express');
const path = require('path');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { TABLO_SIRASI, otomatikYedekleriListele } = require('../yedek');
const paket = require('../../package.json');
const { surumBilgisi, guncellemeKontrol } = require('../surum');
const { hataKaydet, sonHatalar } = require('../hataGunlugu');

const router = express.Router();
const BASLANGIC = Date.now();

// ---- Duyuru panosu: subeye ozel veya tum subelere (sube_id NULL) ----
router.get('/duyurular', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT d.*, k.ad_soyad AS yazan FROM duyurular d LEFT JOIN kullanicilar k ON k.id = d.kullanici_id
         WHERE (d.sube_id IS NULL OR d.sube_id = ?) AND (d.bitis IS NULL OR d.bitis >= date('now'))
         ORDER BY d.onemli DESC, d.tarih DESC LIMIT 20`
      )
      .all(req.user.sube_id)
  );
});

router.post('/duyurular', requireRole('admin', 'eczaci'), (req, res) => {
  const baslik = String(req.body.baslik || '').trim();
  if (!baslik) return res.status(400).json({ error: 'Başlık zorunludur' });
  const bitis = req.body.bitis || null;
  if (bitis && !/^\d{4}-\d{2}-\d{2}$/.test(bitis)) return res.status(400).json({ error: 'Bitiş tarihi geçersiz' });
  // Yalnizca yonetici tum subelere duyuru yapabilir
  const subeId = req.body.tum_subeler && req.user.rol === 'admin' ? null : req.user.sube_id;
  const info = db
    .prepare('INSERT INTO duyurular (sube_id, baslik, metin, onemli, bitis, kullanici_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(subeId, baslik.slice(0, 120), String(req.body.metin || '').trim().slice(0, 1000) || null, req.body.onemli ? 1 : 0, bitis, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM duyurular WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/duyurular/:id', requireRole('admin', 'eczaci'), (req, res) => {
  const d = db.prepare('SELECT * FROM duyurular WHERE id = ?').get(req.params.id);
  if (!d || (d.sube_id !== null && d.sube_id !== req.user.sube_id)) return res.status(404).json({ error: 'Duyuru bulunamadı' });
  if (d.sube_id === null && req.user.rol !== 'admin') return res.status(403).json({ error: 'Tüm şubelere yapılan duyuruyu yalnızca yönetici silebilir' });
  db.prepare('DELETE FROM duyurular WHERE id = ?').run(d.id);
  res.status(204).end();
});

// ---- Sistem durumu (yonetici) ----
router.get('/durum', requireRole('admin'), (req, res) => {
  const sayfa = db.prepare('PRAGMA page_count').get().page_count;
  const boyut = db.prepare('PRAGMA page_size').get().page_size;
  const tablolar = TABLO_SIRASI.map((t) => ({ tablo: t, kayit: db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c }))
    .sort((a, b) => b.kayit - a.kayit);
  let yedekler = [];
  try {
    yedekler = otomatikYedekleriListele();
  } catch (e) {
    yedekler = [];
  }
  res.json({
    surum: paket.version,
    commit: surumBilgisi().kisa,
    node: process.version,
    platform: process.platform,
    calisma_suresi_sn: Math.floor((Date.now() - BASLANGIC) / 1000),
    sunucu_saati: new Date().toISOString(),
    veritabani: {
      yol: process.env.ECZANEM_DB_PATH === ':memory:' ? 'bellek' : path.basename(process.env.ECZANEM_DB_PATH || 'eczane.db'),
      boyut_bayt: sayfa * boyut,
      toplam_kayit: tablolar.reduce((t, x) => t + x.kayit, 0)
    },
    tablolar,
    son_yedek: yedekler[0] || null,
    yedek_sayisi: yedekler.length,
    aktif_oturum: db.prepare("SELECT COUNT(*) AS c FROM oturumlar WHERE bitis > ?").get(Date.now()).c,
    smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  });
});

// ---- Destek: hata raporu, tarayici hatasi kaydi, guncelleme kontrolu ----
router.get('/surum', (req, res) => res.json({ ...surumBilgisi(), node: process.version, platform: process.platform }));

// Tarayicida yakalanan hata (kullanici bildirmeden de kaydedilir); her istek kisa tutulur
router.post('/istemci-hata', (req, res) => {
  const b = req.body || {};
  if (!b.mesaj) return res.status(400).json({ error: 'Mesaj gerekli' });
  hataKaydet('tarayici', b.mesaj, { sayfa: b.sayfa || '', yigin: b.yigin || '', kullanici: req.user.kullanici_adi });
  res.status(201).json({ ok: true });
});

router.get('/hata-raporu', requireRole('admin', 'eczaci'), (req, res) => {
  const adet = Math.min(100, Math.max(1, Number(req.query.adet) || 30));
  res.json({ ...surumBilgisi(), node: process.version, platform: process.platform, sunucu_saati: new Date().toISOString(), hatalar: sonHatalar(adet) });
});

router.get('/guncelleme', requireRole('admin', 'eczaci'), async (req, res) => {
  res.json(await guncellemeKontrol());
});

module.exports = router;
