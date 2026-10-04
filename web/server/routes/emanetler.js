const express = require('express');
const { db } = require('../db');
const { partiGiris, partiCikis } = require('../partiler');

const router = express.Router();

function stokDegistir(ilacId, subeId, fark, aciklama) {
  db.prepare(
    `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
     ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = stok + excluded.stok`
  ).run(ilacId, subeId, fark);
  if (fark > 0) partiGiris(ilacId, subeId, fark, { kaynak: aciklama });
  else partiCikis(ilacId, subeId, -fark);
  db.prepare('INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, ?, ?, ?)').run(
    ilacId,
    subeId,
    fark > 0 ? 'giris' : 'cikis',
    Math.abs(fark),
    aciklama
  );
}

function stokYeterliMi(ilacId, subeId, adet) {
  const r = db.prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?').get(ilacId, subeId);
  return (r ? r.stok : 0) >= adet;
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, i.ad AS ilac_adi, i.alis_fiyati, u.ad_soyad AS kaydeden
       FROM emanetler e JOIN ilaclar i ON i.id = e.ilac_id
       LEFT JOIN kullanicilar u ON u.id = e.kullanici_id
       WHERE e.sube_id = ? ORDER BY e.durum = 'kapandi', e.id DESC LIMIT 500`
    )
    .all(req.user.sube_id);
  // Eczane bazinda acik bakiye: + bizim borcumuz (alinan), - alacagimiz (verilen)
  const ozet = {};
  for (const e of rows.filter((x) => x.durum === 'acik')) {
    const o = (ozet[e.karsi_eczane] ||= { karsi_eczane: e.karsi_eczane, alinan_adet: 0, verilen_adet: 0, borc_degeri: 0, alacak_degeri: 0 });
    const deger = Math.round(e.adet * e.alis_fiyati * 100) / 100;
    if (e.yon === 'alinan') {
      o.alinan_adet += e.adet;
      o.borc_degeri += deger;
    } else {
      o.verilen_adet += e.adet;
      o.alacak_degeri += deger;
    }
  }
  res.json({ emanetler: rows, eczaneler: Object.values(ozet) });
});

router.post('/', (req, res) => {
  const { yon, karsi_eczane, telefon, ilac_id, notlar } = req.body;
  const adet = Number(req.body.adet);
  if (!['alinan', 'verilen'].includes(yon)) return res.status(400).json({ error: 'Yön alınan veya verilen olmalı' });
  if (!String(karsi_eczane || '').trim()) return res.status(400).json({ error: 'Karşı eczane adı zorunlu' });
  if (!Number.isInteger(adet) || adet < 1) return res.status(400).json({ error: 'Adet geçersiz' });
  const ilac = db.prepare('SELECT id, ad FROM ilaclar WHERE id = ?').get(ilac_id);
  if (!ilac) return res.status(404).json({ error: 'Ürün bulunamadı' });
  if (yon === 'verilen' && !stokYeterliMi(ilac.id, req.user.sube_id, adet)) {
    return res.status(400).json({ error: `Yetersiz stok: ${ilac.ad}` });
  }

  db.exec('BEGIN');
  try {
    const id = Number(
      db
        .prepare(
          `INSERT INTO emanetler (sube_id, yon, karsi_eczane, telefon, ilac_id, adet, notlar, kullanici_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(req.user.sube_id, yon, String(karsi_eczane).trim(), telefon || null, ilac.id, adet, notlar || null, req.user.id).lastInsertRowid
    );
    const ad = String(karsi_eczane).trim();
    stokDegistir(ilac.id, req.user.sube_id, yon === 'alinan' ? adet : -adet, `Emanet #${id} ${yon === 'alinan' ? '<- ' : '-> '}${ad}`);
    db.exec('COMMIT');
    res.status(201).json(db.prepare('SELECT * FROM emanetler WHERE id = ?').get(id));
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Emanet kaydedilemedi' });
  }
});

// Kapanis: 'urun_iade' ile emanet urun olarak geri doner (stok ters islenir);
// 'mahsup' ile para/baska urunle kapatilir (stoga dokunulmaz)
router.post('/:id/kapat', (req, res) => {
  const e = db.prepare('SELECT * FROM emanetler WHERE id = ? AND sube_id = ?').get(req.params.id, req.user.sube_id);
  if (!e) return res.status(404).json({ error: 'Emanet bulunamadı' });
  if (e.durum !== 'acik') return res.status(400).json({ error: 'Emanet zaten kapanmış' });
  const sekil = req.body.sekil || 'urun_iade';
  if (!['urun_iade', 'mahsup'].includes(sekil)) return res.status(400).json({ error: 'Geçersiz kapanış şekli' });
  if (sekil === 'urun_iade' && e.yon === 'alinan' && !stokYeterliMi(e.ilac_id, e.sube_id, e.adet)) {
    return res.status(400).json({ error: 'Geri vermek için stok yetersiz' });
  }

  db.exec('BEGIN');
  try {
    if (sekil === 'urun_iade') {
      stokDegistir(e.ilac_id, e.sube_id, e.yon === 'alinan' ? -e.adet : e.adet, `Emanet #${e.id} kapanış (${e.karsi_eczane})`);
    }
    db.prepare("UPDATE emanetler SET durum = 'kapandi', kapanis_sekli = ?, kapanis_tarihi = datetime('now') WHERE id = ?").run(sekil, e.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Emanet kapatılamadı' });
  }
  res.json(db.prepare('SELECT * FROM emanetler WHERE id = ?').get(e.id));
});

module.exports = router;
