const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { partiCikis } = require('../partiler');
const { sendPdf } = require('../export');

const router = express.Router();
const yonetici = requireRole('admin', 'eczaci');

// Soguk zincir icin kabul edilen aralik (°C)
const SICAKLIK_MIN = 2;
const SICAKLIK_MAX = 8;

// Belirli bir partiden stok dusurur, stok hareketi yazar
function partidenDus(ilacId, subeId, partiId, adet, aciklama) {
  const dagilim = partiCikis(ilacId, subeId, adet, partiId);
  const dusulen = dagilim.reduce((t, d) => t + d.adet, 0);
  if (dusulen > 0) {
    db.prepare('UPDATE ilac_stok SET stok = stok - ? WHERE ilac_id = ? AND sube_id = ?').run(dusulen, ilacId, subeId);
    db.prepare("INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, 'cikis', ?, ?)").run(
      ilacId,
      subeId,
      dusulen,
      aciklama
    );
  }
  return dusulen;
}

// ---- Geri cagirma: parti numarasiyla kime satildigini ve stoktaki miktari bulur ----
function geriCagirmaSorgu(ilacId, partiNo, subeId) {
  const partiler = db
    .prepare(
      `SELECT p.id, p.parti_no, p.skt, p.miktar, p.giris_miktari, s.ad AS sube_adi, p.sube_id
       FROM ilac_partileri p JOIN subeler s ON s.id = p.sube_id
       WHERE p.ilac_id = ? AND p.parti_no = ? ORDER BY p.sube_id`
    )
    .all(ilacId, partiNo);
  const satislar = db
    .prepare(
      `SELECT sa.id AS satis_id, sa.tarih, SUM(skp.adet) AS adet, m.id AS musteri_id, m.ad_soyad AS musteri_adi, m.telefon
       FROM satis_kalemi_partileri skp
       JOIN ilac_partileri p ON p.id = skp.parti_id
       JOIN satis_kalemleri sk ON sk.id = skp.satis_kalem_id
       JOIN satislar sa ON sa.id = sk.satis_id
       LEFT JOIN musteriler m ON m.id = sa.musteri_id
       WHERE p.ilac_id = ? AND p.parti_no = ? AND sa.sube_id = ?
       GROUP BY sa.id ORDER BY sa.tarih DESC`
    )
    .all(ilacId, partiNo, subeId);
  return { partiler, satislar };
}

router.get('/geri-cagirma/sorgu', yonetici, (req, res) => {
  const ilacId = Number(req.query.ilac_id);
  const partiNo = String(req.query.parti_no || '').trim();
  if (!ilacId || !partiNo) return res.status(400).json({ error: 'İlaç ve parti numarası zorunludur' });
  res.json(geriCagirmaSorgu(ilacId, partiNo, req.user.sube_id));
});

router.get('/geri-cagirmalar', yonetici, (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT g.*, i.ad AS ilac_adi, k.ad_soyad AS kullanici_adi FROM geri_cagirmalar g
         JOIN ilaclar i ON i.id = g.ilac_id LEFT JOIN kullanicilar k ON k.id = g.kullanici_id
         WHERE g.sube_id = ? ORDER BY g.tarih DESC, g.id DESC LIMIT 200`
      )
      .all(req.user.sube_id)
  );
});

router.post('/geri-cagirmalar', yonetici, (req, res) => {
  const ilacId = Number(req.body.ilac_id);
  const partiNo = String(req.body.parti_no || '').trim();
  const ilac = db.prepare('SELECT id, ad FROM ilaclar WHERE id = ?').get(ilacId);
  if (!ilac || !partiNo) return res.status(400).json({ error: 'İlaç ve parti numarası zorunludur' });
  const { partiler, satislar } = geriCagirmaSorgu(ilacId, partiNo, req.user.sube_id);
  if (!partiler.length) return res.status(404).json({ error: 'Bu parti numarası kayıtlı değil' });

  db.exec('BEGIN');
  try {
    const info = db
      .prepare('INSERT INTO geri_cagirmalar (sube_id, ilac_id, parti_no, aciklama, etkilenen_satis, kullanici_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.sube_id, ilacId, partiNo, req.body.aciklama || null, satislar.length, req.user.id);
    const id = Number(info.lastInsertRowid);
    let cekilen = 0;
    if (req.body.stoktan_cek) {
      for (const p of partiler.filter((x) => x.sube_id === req.user.sube_id && x.miktar > 0)) {
        cekilen += partidenDus(ilacId, req.user.sube_id, p.id, p.miktar, `Geri çağırma #${id} (parti ${partiNo})`);
      }
      db.prepare('UPDATE geri_cagirmalar SET stoktan_cekilen = ? WHERE id = ?').run(cekilen, id);
    }
    db.exec('COMMIT');
    res.status(201).json({ ...db.prepare('SELECT * FROM geri_cagirmalar WHERE id = ?').get(id), ilac_adi: ilac.ad, satislar });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Geri çağırma kaydedilemedi' });
  }
});

// ---- Imha tutanagi ----
router.get('/imha-adaylari', yonetici, (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT p.id AS parti_id, p.ilac_id, i.ad AS ilac_adi, p.parti_no, p.skt, p.miktar, i.alis_fiyati,
                CASE WHEN p.skt < date('now') THEN 1 ELSE 0 END AS skt_gecmis
         FROM ilac_partileri p JOIN ilaclar i ON i.id = p.ilac_id
         WHERE p.sube_id = ? AND p.miktar > 0 AND p.skt IS NOT NULL AND p.skt < date('now', '+30 days')
         ORDER BY p.skt, i.ad`
      )
      .all(req.user.sube_id)
  );
});

router.get('/imhalar', yonetici, (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT im.*, k.ad_soyad AS kullanici_adi, (SELECT COUNT(*) FROM imha_kalemleri WHERE imha_id = im.id) AS kalem_sayisi
         FROM imhalar im LEFT JOIN kullanicilar k ON k.id = im.kullanici_id
         WHERE im.sube_id = ? ORDER BY im.tarih DESC, im.id DESC LIMIT 200`
      )
      .all(req.user.sube_id)
  );
});

const IMHA_YONTEMLERI = ['lisansli_firma', 'depo_iadesi', 'diger'];
router.post('/imhalar', yonetici, (req, res) => {
  const kalemler = Array.isArray(req.body.kalemler) ? req.body.kalemler : [];
  if (!kalemler.length) return res.status(400).json({ error: 'En az bir kalem seçin' });
  if (!IMHA_YONTEMLERI.includes(req.body.yontem)) return res.status(400).json({ error: 'Geçersiz imha yöntemi' });

  const partiGetir = db.prepare(
    `SELECT p.*, i.ad AS ilac_adi, i.alis_fiyati FROM ilac_partileri p JOIN ilaclar i ON i.id = p.ilac_id WHERE p.id = ? AND p.sube_id = ?`
  );
  const hazir = [];
  for (const k of kalemler) {
    const parti = partiGetir.get(Number(k.parti_id), req.user.sube_id);
    const adet = Number(k.adet);
    if (!parti) return res.status(404).json({ error: 'Parti bulunamadı' });
    if (!(Number.isInteger(adet) && adet > 0 && adet <= parti.miktar)) {
      return res.status(400).json({ error: `${parti.ilac_adi}: adet 1 ile ${parti.miktar} arasında olmalı` });
    }
    hazir.push({ parti, adet });
  }

  db.exec('BEGIN');
  try {
    const info = db
      .prepare('INSERT INTO imhalar (sube_id, yontem, tanik, aciklama, kullanici_id) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.sube_id, req.body.yontem, req.body.tanik || null, req.body.aciklama || null, req.user.id);
    const id = Number(info.lastInsertRowid);
    const kalemEkle = db.prepare(
      'INSERT INTO imha_kalemleri (imha_id, ilac_id, ilac_adi, parti_id, parti_no, skt, adet, birim_maliyet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    let toplamAdet = 0;
    let toplamMaliyet = 0;
    for (const { parti, adet } of hazir) {
      partidenDus(parti.ilac_id, req.user.sube_id, parti.id, adet, `İmha #${id}`);
      kalemEkle.run(id, parti.ilac_id, parti.ilac_adi, parti.id, parti.parti_no, parti.skt, adet, parti.alis_fiyati || 0);
      toplamAdet += adet;
      toplamMaliyet += adet * (parti.alis_fiyati || 0);
    }
    db.prepare('UPDATE imhalar SET toplam_adet = ?, toplam_maliyet = ? WHERE id = ?').run(toplamAdet, Math.round(toplamMaliyet * 100) / 100, id);
    db.exec('COMMIT');
    res.status(201).json(db.prepare('SELECT * FROM imhalar WHERE id = ?').get(id));
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'İmha kaydedilemedi' });
  }
});

const YONTEM_ADI = { lisansli_firma: 'Lisanslı imha firması', depo_iadesi: 'Depoya iade', diger: 'Diğer' };
router.get('/imhalar/:id/tutanak', yonetici, (req, res) => {
  const imha = db.prepare('SELECT * FROM imhalar WHERE id = ? AND sube_id = ?').get(req.params.id, req.user.sube_id);
  if (!imha) return res.status(404).json({ error: 'İmha kaydı bulunamadı' });
  const kalemler = db.prepare('SELECT * FROM imha_kalemleri WHERE imha_id = ? ORDER BY id').all(imha.id);
  const baslik = `İmha Tutanağı #${imha.id} — ${imha.tarih.slice(0, 10)} — ${YONTEM_ADI[imha.yontem]}${imha.tanik ? ' — Tanık: ' + imha.tanik : ''}`;
  if (req.query.format === 'pdf') {
    return sendPdf(res, `imha-tutanagi-${imha.id}.pdf`, baslik, kalemler, [
      { alan: 'ilac_adi', baslik: 'Ürün' },
      { alan: 'parti_no', baslik: 'Parti No' },
      { alan: 'skt', baslik: 'SKT' },
      { alan: 'adet', baslik: 'Adet' },
      { alan: 'birim_maliyet', baslik: 'Birim Maliyet (TL)' }
    ]);
  }
  res.json({ ...imha, yontem_adi: YONTEM_ADI[imha.yontem], kalemler });
});

// ---- Soguk zincir sicaklik defteri ----
router.get('/sicaklik', (req, res) => {
  const gun = Math.min(Math.max(Number(req.query.gun) || 7, 1), 90);
  const kayitlar = db
    .prepare(
      `SELECT s.*, k.ad_soyad AS kullanici_adi FROM sicaklik_kayitlari s LEFT JOIN kullanicilar k ON k.id = s.kullanici_id
       WHERE s.sube_id = ? AND s.tarih >= datetime('now', ?) ORDER BY s.tarih DESC, s.id DESC`
    )
    .all(req.user.sube_id, `-${gun} days`);
  const degerler = kayitlar.map((k) => k.sicaklik);
  res.json({
    aralik: { min: SICAKLIK_MIN, max: SICAKLIK_MAX },
    kayitlar,
    ozet: {
      olcum: kayitlar.length,
      aralik_disi: kayitlar.filter((k) => k.aralik_disi).length,
      en_dusuk: degerler.length ? Math.min(...degerler) : null,
      en_yuksek: degerler.length ? Math.max(...degerler) : null,
      bugun_olcum: db
        .prepare("SELECT COUNT(*) AS c FROM sicaklik_kayitlari WHERE sube_id = ? AND date(tarih) = date('now')")
        .get(req.user.sube_id).c
    }
  });
});

router.post('/sicaklik', (req, res) => {
  const sicaklik = Number(req.body.sicaklik);
  if (req.body.sicaklik === '' || req.body.sicaklik == null || !Number.isFinite(sicaklik) || sicaklik < -30 || sicaklik > 50) {
    return res.status(400).json({ error: 'Sıcaklık -30 ile 50 °C arasında bir sayı olmalı' });
  }
  const dolap = String(req.body.dolap || 'Buzdolabı').trim().slice(0, 40) || 'Buzdolabı';
  const araliktaDegil = sicaklik < SICAKLIK_MIN || sicaklik > SICAKLIK_MAX ? 1 : 0;
  const info = db
    .prepare('INSERT INTO sicaklik_kayitlari (sube_id, dolap, sicaklik, aralik_disi, notlar, kullanici_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.sube_id, dolap, sicaklik, araliktaDegil, req.body.notlar || null, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM sicaklik_kayitlari WHERE id = ?').get(info.lastInsertRowid));
});

module.exports = router;
module.exports.SICAKLIK_ARALIGI = { min: SICAKLIK_MIN, max: SICAKLIK_MAX };
