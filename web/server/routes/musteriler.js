const express = require('express');
const { db } = require('../db');
const { musteriBakiyesi } = require('../cari');
const sadakat = require('../sadakat');
const { requireRole } = require('../auth');
const { bildirimGonder } = require('../bildirim');
const { etkilesimleriBul, alerjiKontrol } = require('../etkilesim');

function limitOku(deger) {
  if (deger === undefined || deger === null || deger === '') return null;
  const n = Number(deger);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, COALESCE((SELECT SUM(puan) FROM puan_hareketleri p WHERE p.musteri_id = m.id), 0) AS puan
       FROM musteriler m ORDER BY m.ad_soyad`
    )
    .all();
  const q = String(req.query.q || '').trim();
  if (!q) return res.json(rows);
  // SQLite LIKE yalnizca ASCII harflerde buyuk/kucuk harf duyarsizdir; Turkce harfler icin JS'de karsilastir
  const kucuk = (m) => String(m || '').toLocaleLowerCase('tr-TR');
  const needle = kucuk(q);
  res.json(rows.filter((m) => kucuk(m.ad_soyad).includes(needle) || (m.telefon || '').includes(q) || (m.tc_no || '').includes(q)));
});

// RFM benzeri musteri segmentleri: son alim, sikligi ve harcamaya gore
const SEGMENT_ADLARI = { sadik: 'Sadık', yeni: 'Yeni', risk: 'Kaybedilmek üzere', kayip: 'Kayıp', ara: 'Ara sıra', hic: 'Alışveriş yok' };
function musteriSegmentleri() {
  const rows = db
    .prepare(
      `SELECT m.id, m.ad_soyad, m.telefon, m.ileti_izni,
              MIN(sa.tarih) AS ilk_alim, MAX(sa.tarih) AS son_alim,
              SUM(CASE WHEN sa.tarih >= datetime('now', '-180 days') THEN 1 ELSE 0 END) AS alim_180,
              COUNT(sa.id) AS alim_toplam,
              ROUND(COALESCE(SUM(CASE WHEN sa.tarih >= datetime('now', '-365 days') THEN sa.toplam_tutar END), 0), 2) AS harcama_365,
              CAST(julianday('now') - julianday(MAX(sa.tarih)) AS INTEGER) AS gun_once
       FROM musteriler m LEFT JOIN satislar sa ON sa.musteri_id = m.id
       GROUP BY m.id ORDER BY harcama_365 DESC, m.ad_soyad`
    )
    .all();
  return rows.map((r) => {
    let segment;
    if (!r.alim_toplam) segment = 'hic';
    else if (julianDay(r.ilk_alim) >= -30) segment = 'yeni';
    else if (r.gun_once <= 45 && r.alim_180 >= 4) segment = 'sadik';
    else if (r.gun_once > 120) segment = 'kayip';
    else if (r.gun_once > 45 && r.alim_toplam >= 2) segment = 'risk';
    else segment = 'ara';
    return { ...r, segment, segment_adi: SEGMENT_ADLARI[segment] };
  });
}
// tarihin bugune gore kac gun once oldugu (negatif = gecmis)
function julianDay(tarih) {
  return -Math.floor((Date.now() - new Date(String(tarih).replace(' ', 'T') + 'Z').getTime()) / 86400000);
}

router.get('/segmentler', (req, res) => {
  const liste = musteriSegmentleri();
  const ozet = {};
  for (const k of Object.keys(SEGMENT_ADLARI)) ozet[k] = { ad: SEGMENT_ADLARI[k], sayi: 0 };
  for (const m of liste) ozet[m.segment].sayi += 1;
  res.json({ ozet, musteriler: liste });
});

// Onumuzdeki N gun icinde dogum gunu olan musteriler (yil sonu gecisi dahil)
function yaklasanDogumGunleri(gun) {
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  return db
    .prepare('SELECT id, ad_soyad, telefon, dogum_tarihi, ileti_izni FROM musteriler WHERE dogum_tarihi IS NOT NULL')
    .all()
    .map((m) => {
      const [y, a, g] = m.dogum_tarihi.split('-').map(Number);
      let sonraki = new Date(bugun.getFullYear(), a - 1, g);
      if (sonraki < bugun) sonraki = new Date(bugun.getFullYear() + 1, a - 1, g);
      const kalan = Math.round((sonraki - bugun) / 86400000);
      return { ...m, kalan_gun: kalan, yeni_yas: sonraki.getFullYear() - y };
    })
    .filter((m) => m.kalan_gun <= gun)
    .sort((x, z) => x.kalan_gun - z.kalan_gun || x.ad_soyad.localeCompare(z.ad_soyad, 'tr'));
}

router.get('/dogum-gunleri', (req, res) => {
  const istenen = req.query.gun === undefined || req.query.gun === '' ? 7 : Number(req.query.gun);
  const gun = Number.isFinite(istenen) ? Math.min(Math.max(Math.floor(istenen), 0), 60) : 7;
  res.json(yaklasanDogumGunleri(gun));
});

router.post('/:id/dogum-gunu-mesaji', async (req, res) => {
  const m = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  if (!m.ileti_izni) return res.status(409).json({ error: 'Müşterinin ileti izni (İYS) yok' });
  if (!m.telefon) return res.status(400).json({ error: 'Müşterinin telefonu yok' });
  const ad = m.ad_soyad.split(/\s+/)[0];
  const mesaj = String(req.body.mesaj || '').trim() || `Sevgili ${ad}, doğum gününüzü kutlar sağlıklı nice yıllar dileriz. — Eczanemiz`;
  const b = await bildirimGonder(m, 'sms', mesaj.slice(0, 480));
  res.status(201).json(b);
});

// Sadakat puani ayarlari (herkes okur, yalnizca admin degistirir)
router.get('/sadakat/ayarlar', (req, res) => res.json(sadakat.ayarlar()));
router.put('/sadakat/ayarlar', requireRole('admin'), (req, res) => {
  const kazanim = Number(req.body.kazanim_orani);
  const deger = Number(req.body.puan_degeri);
  if (!(kazanim >= 0 && kazanim <= 100) || !(deger > 0 && deger <= 10)) {
    return res.status(400).json({ error: 'Kazanım oranı 0-100, puan değeri 0-10 TL arasında olmalı' });
  }
  res.json(sadakat.ayarlariKaydet({ kazanim_orani: kazanim, puan_degeri: deger, aktif: req.body.aktif !== false }));
});

// Hasta ilac kullanim karti: son `gun` gunde alinan ilaclar, son kullanim talimati,
// aralarindaki etkilesimler ve saglik notundaki alerjiler
router.get('/:id/kullanim-karti', (req, res) => {
  const musteri = db.prepare('SELECT id, ad_soyad, tc_no, telefon, saglik_notu FROM musteriler WHERE id = ?').get(req.params.id);
  if (!musteri) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  const gun = Math.min(365, Math.max(7, Number(req.query.gun) || 90));
  const ilaclar = db
    .prepare(
      `SELECT i.id, i.ad, i.etken_madde, i.receteli, i.recete_turu,
              MAX(sa.tarih) AS son_alim, SUM(sk.adet) AS toplam_adet,
              (SELECT sk2.kullanim FROM satis_kalemleri sk2 JOIN satislar sa2 ON sa2.id = sk2.satis_id
                WHERE sa2.musteri_id = sa.musteri_id AND sk2.ilac_id = i.id AND sk2.kullanim IS NOT NULL
                ORDER BY sa2.tarih DESC, sk2.id DESC LIMIT 1) AS kullanim
       FROM satis_kalemleri sk
       JOIN satislar sa ON sa.id = sk.satis_id
       JOIN ilaclar i ON i.id = sk.ilac_id
       WHERE sa.musteri_id = ? AND sa.tarih >= datetime('now', ?) AND i.urun_tipi IN ('ilac', 'takviye')
       GROUP BY i.id ORDER BY son_alim DESC`
    )
    .all(musteri.id, `-${gun} days`);
  const { etkilesimler, mukerrer } = etkilesimleriBul(ilaclar.map((i) => ({ ...i, kaynak: 'sepet' })));
  const alerji = alerjiKontrol(musteri.saglik_notu, ilaclar);
  res.json({ musteri, gun, ilaclar, etkilesimler, mukerrer, alerji, tarih: new Date().toISOString().slice(0, 10) });
});

router.get('/:id/puan', (req, res) => {
  const hareketler = db
    .prepare('SELECT * FROM puan_hareketleri WHERE musteri_id = ? ORDER BY id DESC LIMIT 200')
    .all(req.params.id);
  res.json({ bakiye: sadakat.puanBakiyesi(Number(req.params.id)), hareketler });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  res.json({ ...row, veresiye_bakiyesi: musteriBakiyesi(row.id), puan: sadakat.puanBakiyesi(row.id) });
});

router.get('/:id/satislar', (req, res) => {
  const musteri = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!musteri) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  const satislar = db
    .prepare('SELECT * FROM satislar WHERE musteri_id = ? ORDER BY tarih DESC')
    .all(req.params.id);
  res.json(satislar);
});

const GEBELIK_DURUMLARI = ['gebe', 'emziren'];
function hastaAlanlariHatasi(govde) {
  const t = govde.dogum_tarihi;
  if (t && (!/^\d{4}-\d{2}-\d{2}$/.test(t) || t > new Date().toISOString().slice(0, 10))) return 'Doğum tarihi geçersiz';
  if (govde.gebelik_durumu && !GEBELIK_DURUMLARI.includes(govde.gebelik_durumu)) return 'Geçersiz gebelik durumu';
  return null;
}
// Yalnizca istekte gelen alanlar guncellenir
function hastaAlanlariKaydet(id, govde) {
  const alanlar = [];
  const degerler = [];
  for (const alan of ['dogum_tarihi', 'gebelik_durumu']) {
    if (!(alan in govde)) continue;
    alanlar.push(`${alan} = ?`);
    degerler.push(govde[alan] || null);
  }
  if (alanlar.length) db.prepare(`UPDATE musteriler SET ${alanlar.join(', ')} WHERE id = ?`).run(...degerler, id);
}

router.post('/', (req, res) => {
  const { ad_soyad, telefon, email, tc_no, adres, saglik_notu } = req.body;
  if (!ad_soyad || !ad_soyad.trim()) return res.status(400).json({ error: 'Ad soyad zorunludur' });
  const hastaHatasi = hastaAlanlariHatasi(req.body);
  if (hastaHatasi) return res.status(400).json({ error: hastaHatasi });
  const limit = limitOku(req.body.veresiye_limiti);
  if (Number.isNaN(limit)) return res.status(400).json({ error: 'Geçersiz veresiye limiti' });

  const info = db
    .prepare('INSERT INTO musteriler (ad_soyad, telefon, email, tc_no, adres, saglik_notu, veresiye_limiti, ileti_izni) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(ad_soyad.trim(), telefon || null, email || null, tc_no || null, adres || null, saglik_notu || null, limit, req.body.ileti_izni ? 1 : 0);
  hastaAlanlariKaydet(info.lastInsertRowid, req.body);
  res.status(201).json(db.prepare('SELECT * FROM musteriler WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Müşteri bulunamadı' });

  const { ad_soyad, telefon, email, tc_no, adres, saglik_notu } = req.body;
  if (!ad_soyad || !ad_soyad.trim()) return res.status(400).json({ error: 'Ad soyad zorunludur' });
  const hastaHatasi = hastaAlanlariHatasi(req.body);
  if (hastaHatasi) return res.status(400).json({ error: hastaHatasi });
  // veresiye_limiti gonderilmezse mevcut deger korunur
  const limit = 'veresiye_limiti' in req.body ? limitOku(req.body.veresiye_limiti) : existing.veresiye_limiti;
  if (Number.isNaN(limit)) return res.status(400).json({ error: 'Geçersiz veresiye limiti' });

  const iletiIzni = 'ileti_izni' in req.body ? (req.body.ileti_izni ? 1 : 0) : existing.ileti_izni;
  db.prepare('UPDATE musteriler SET ad_soyad=?, telefon=?, email=?, tc_no=?, adres=?, saglik_notu=?, veresiye_limiti=?, ileti_izni=? WHERE id=?').run(
    ad_soyad.trim(),
    telefon || null,
    email || null,
    tc_no || null,
    adres || null,
    saglik_notu || null,
    limit,
    iletiIzni,
    req.params.id
  );
  hastaAlanlariKaydet(req.params.id, req.body);
  res.json(db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  if (Math.abs(musteriBakiyesi(existing.id)) > 0.001) {
    return res.status(400).json({ error: 'Veresiye bakiyesi olan müşteri silinemez' });
  }
  db.prepare('DELETE FROM musteriler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
module.exports.yaklasanDogumGunleri = yaklasanDogumGunleri;
