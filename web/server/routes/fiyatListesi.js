// Fiyat listesi (depo / TITCK / firma Excel ya da CSV): barkodla eslesen urunlerin fiyat hareketlerini kaydeder,
// liste PSF'si satis fiyatindan farkli olanlari gosterir; secilenler satis fiyatina uygulanir (raf etiketi yeniden basilir).
const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { csvAyristir } = require('../csvIceAktar');
const { xlsxOku } = require('../xlsxOku');
const { sayiOku } = require('../ilacBilgi');
const { yerelSimdi } = require('../zaman');
const { fiyatHareketiYaz } = require('./ilacBilgi');

const router = express.Router();
const yonetici = requireRole('admin', 'eczaci');

const anahtar = (m) =>
  String(m || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
const SUTUNLAR = {
  barkod: ['barkod', 'barcode', 'gtin', 'ean', 'urunbarkodu', 'ilacbarkodu', 'guncelbarkod'],
  psf: ['psf', 'perakendesatisfiyati', 'perakendefiyati', 'perakende', 'etiketfiyati'],
  depocu_fiyati: ['dsf', 'depocusatisfiyati', 'depocuyasatisfiyati', 'depocufiyati'],
  kamu_fiyati: ['kf', 'kamufiyati'],
  imalatci_fiyati: ['isf', 'imalatcisatisfiyati', 'imalatcifiyati']
};
function sutunBul(baslik) {
  const s = {};
  baslik.forEach((h, i) => {
    const k = anahtar(h);
    if (!k) return;
    for (const [alan, adlar] of Object.entries(SUTUNLAR)) {
      if (s[alan] !== undefined) continue;
      if (adlar.some((a) => k === a || (a.length >= 3 && k.startsWith(a)))) s[alan] = i;
    }
  });
  return s;
}

// Tablo (satir dizisi) → { kayitlar: [{barkod, psf, ...}], sutunlar }
function listeyiCoz(tablo) {
  for (let bi = 0; bi < Math.min(20, tablo.length); bi++) {
    const s = sutunBul(tablo[bi]);
    const fiyatlar = Object.keys(s).filter((a) => a !== 'barkod');
    if (s.barkod === undefined || !fiyatlar.length) continue;
    const kayitlar = [];
    for (const r of tablo.slice(bi + 1)) {
      const barkod = String(r[s.barkod] || '').replace(/\D/g, '');
      if (!/^\d{8,14}$/.test(barkod)) continue;
      const k = { barkod };
      for (const a of fiyatlar) {
        const n = sayiOku(String(r[s[a]] ?? '').replace(/[^\d.,-]/g, ''));
        if (n != null && !Number.isNaN(n) && n > 0) k[a] = n;
      }
      if (Object.keys(k).length > 1) kayitlar.push(k);
    }
    return { kayitlar, sutunlar: ['barkod', ...fiyatlar] };
  }
  return { hata: 'Barkod ve fiyat (PSF / DSF / KF) sütunları bulunamadı' };
}

function tabloOku(tampon) {
  if (tampon.length > 4 && tampon.readUInt32LE(0) === 0x04034b50) {
    const sayfalar = xlsxOku(tampon);
    for (const s of sayfalar) {
      const c = listeyiCoz(s.satirlar.map((r) => r.map((h) => (h == null ? '' : String(h)))));
      if (!c.hata) return c;
    }
    return { hata: 'Excel dosyasında barkod ve fiyat sütunu bulunamadı' };
  }
  return listeyiCoz(csvAyristir(tampon.toString('utf8').replace(/^﻿/, '')));
}

const yuvarla = (n) => Math.round(n * 100) / 100;

// Son fiyat hareketindeki PSF'si satis fiyatindan farkli urunler
function fiyatFarklari() {
  return db
    .prepare(
      `SELECT i.id, i.ad, i.barkod, i.satis_fiyati, h.psf AS liste_psf, h.tarih, h.kaynak
       FROM ilaclar i
       JOIN fiyat_hareketleri h ON h.id = (SELECT id FROM fiyat_hareketleri WHERE ilac_id = i.id AND psf IS NOT NULL ORDER BY tarih DESC, id DESC LIMIT 1)
       WHERE ABS(h.psf - i.satis_fiyati) >= 0.005
       ORDER BY i.ad`
    )
    .all()
    .map((r) => ({ ...r, fark: yuvarla(r.liste_psf - r.satis_fiyati), yuzde: r.satis_fiyati > 0 ? Math.round(((r.liste_psf - r.satis_fiyati) / r.satis_fiyati) * 1000) / 10 : null }));
}

function uygula(idler) {
  const farklar = new Map(fiyatFarklari().map((f) => [f.id, f]));
  const gecmis = db.prepare('INSERT INTO fiyat_gecmisi (ilac_id, eski_fiyat, yeni_fiyat) VALUES (?, ?, ?)');
  const guncelle = db.prepare('UPDATE ilaclar SET satis_fiyati = ? WHERE id = ?');
  const uygulanan = [];
  db.exec('BEGIN');
  try {
    for (const id of idler) {
      const f = farklar.get(Number(id));
      if (!f) continue;
      guncelle.run(f.liste_psf, f.id);
      gecmis.run(f.id, f.satis_fiyati, f.liste_psf);
      uygulanan.push(f.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return uygulanan;
}

router.get('/farklar', (req, res) => res.json(fiyatFarklari()));

router.post('/yukle', yonetici, express.raw({ type: 'application/octet-stream', limit: '30mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Dosya gönderilmedi' });
  let c;
  try {
    c = tabloOku(req.body);
  } catch (err) {
    return res.status(400).json({ error: 'Dosya okunamadı: ' + err.message });
  }
  if (c.hata) return res.status(400).json({ error: c.hata });
  const barkodla = db.prepare('SELECT id FROM ilaclar WHERE barkod = ?');
  const tarih = yerelSimdi().toISOString().slice(0, 10);
  const alanlar = ['depocu_fiyati', 'kamu_fiyati', 'imalatci_fiyati', 'psf'];
  let eslesen = 0;
  let degisen = 0;
  db.exec('BEGIN');
  try {
    for (const k of c.kayitlar) {
      const ilac = barkodla.get(k.barkod);
      if (!ilac) continue;
      eslesen++;
      db.prepare('INSERT OR IGNORE INTO ilac_bilgi (ilac_id) VALUES (?)').run(ilac.id);
      const set = alanlar.filter((a) => k[a] != null && a !== 'psf');
      if (set.length) db.prepare(`UPDATE ilac_bilgi SET ${set.map((a) => `${a} = ?`).join(', ')}, guncelleme = datetime('now') WHERE ilac_id = ?`).run(...set.map((a) => k[a]), ilac.id);
      if (fiyatHareketiYaz(ilac.id, k, tarih, 'fiyat listesi')) degisen++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Liste kaydedilemedi: ' + err.message });
  }
  const uygulanan = req.query.otomatik === '1' ? uygula(fiyatFarklari().map((f) => f.id)) : [];
  res.json({ satir: c.kayitlar.length, eslesen, degisen, sutunlar: c.sutunlar, uygulanan, farklar: fiyatFarklari() });
});

router.post('/uygula', yonetici, (req, res) => {
  const idler = Array.isArray(req.body && req.body.idler) ? req.body.idler.map(Number).filter((n) => n > 0) : [];
  if (!idler.length) return res.status(400).json({ error: 'Ürün seçin' });
  res.json({ uygulanan: uygula(idler) });
});

module.exports = router;
module.exports.fiyatFarklari = fiyatFarklari;
