const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/oneriler', (req, res) => {
  const subeId = req.user.sube_id;
  const rows = db
    .prepare(
      `SELECT i.id AS ilac_id, i.ad, i.barkod, i.kritik_stok, i.alis_fiyati, COALESCE(s.stok, 0) AS stok
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       WHERE COALESCE(s.stok, 0) <= i.kritik_stok
       ORDER BY i.ad`
    )
    .all(subeId);

  const oneriler = rows.map((r) => ({
    ...r,
    onerilen_adet: Math.max(r.kritik_stok * 2 - r.stok, r.kritik_stok)
  }));
  res.json(oneriler);
});

router.get('/', (req, res) => {
  const { durum, tedarikci_id } = req.query;
  let sql = `
    SELECT sp.*, t.firma_adi AS tedarikci_adi, u.ad_soyad AS olusturan,
           (SELECT COUNT(*) FROM siparis_kalemleri WHERE siparis_id = sp.id) AS kalem_sayisi
    FROM siparisler sp
    LEFT JOIN tedarikciler t ON t.id = sp.tedarikci_id
    LEFT JOIN kullanicilar u ON u.id = sp.kullanici_id
    WHERE sp.sube_id = ?
  `;
  const params = [req.user.sube_id];
  if (durum) {
    sql += ' AND sp.durum = ?';
    params.push(durum);
  }
  if (tedarikci_id) {
    sql += ' AND sp.tedarikci_id = ?';
    params.push(Number(tedarikci_id));
  }
  sql += ' ORDER BY sp.olusturma_tarihi DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const siparis = db.prepare('SELECT * FROM siparisler WHERE id = ?').get(req.params.id);
  if (!siparis) return res.status(404).json({ error: 'Siparis bulunamadi' });
  const kalemler = db.prepare('SELECT * FROM siparis_kalemleri WHERE siparis_id = ?').all(req.params.id);
  res.json({ ...siparis, kalemler });
});

router.post('/', (req, res) => {
  const { tedarikci_id, notlar, kalemler } = req.body;
  if (!tedarikci_id) return res.status(400).json({ error: 'Tedarikci secimi zorunludur' });
  if (!Array.isArray(kalemler) || kalemler.length === 0) {
    return res.status(400).json({ error: 'En az bir ilac eklemelisiniz' });
  }

  const tedarikci = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(tedarikci_id);
  if (!tedarikci) return res.status(404).json({ error: 'Tedarikci bulunamadi' });

  const hazirlanmis = [];
  for (const k of kalemler) {
    const adet = Number(k.istenen_adet);
    if (!k.ilac_id || !Number.isFinite(adet) || adet <= 0) {
      return res.status(400).json({ error: 'Gecersiz siparis kalemi' });
    }
    const ilac = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(k.ilac_id);
    if (!ilac) return res.status(404).json({ error: `Ilac bulunamadi: ${k.ilac_id}` });
    hazirlanmis.push({ ilac, adet, fiyat: Number(k.tahmini_birim_fiyat) || ilac.alis_fiyati });
  }

  db.exec('BEGIN');
  try {
    const info = db
      .prepare('INSERT INTO siparisler (tedarikci_id, sube_id, kullanici_id, notlar) VALUES (?, ?, ?, ?)')
      .run(tedarikci_id, req.user.sube_id, req.user.id, notlar || null);
    const siparisId = info.lastInsertRowid;

    const insertKalem = db.prepare(
      `INSERT INTO siparis_kalemleri (siparis_id, ilac_id, ilac_adi, istenen_adet, tahmini_birim_fiyat)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const { ilac, adet, fiyat } of hazirlanmis) {
      insertKalem.run(siparisId, ilac.id, ilac.ad, adet, fiyat);
    }
    db.exec('COMMIT');

    const siparis = db.prepare('SELECT * FROM siparisler WHERE id = ?').get(siparisId);
    const kalemlerSonuc = db.prepare('SELECT * FROM siparis_kalemleri WHERE siparis_id = ?').all(siparisId);
    res.status(201).json({ ...siparis, kalemler: kalemlerSonuc });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Siparis olusturulamadi' });
  }
});

router.put('/:id/durum', (req, res) => {
  const siparis = db.prepare('SELECT * FROM siparisler WHERE id = ?').get(req.params.id);
  if (!siparis) return res.status(404).json({ error: 'Siparis bulunamadi' });

  const { durum } = req.body;
  if (!['beklemede', 'gonderildi', 'teslim_alindi', 'iptal'].includes(durum)) {
    return res.status(400).json({ error: 'Gecersiz durum' });
  }
  if (siparis.durum === 'teslim_alindi' || siparis.durum === 'iptal') {
    return res.status(400).json({ error: 'Bu siparis zaten sonuclandirilmis, durumu degistirilemez' });
  }

  if (durum === 'teslim_alindi') {
    const kalemler = db.prepare('SELECT * FROM siparis_kalemleri WHERE siparis_id = ?').all(req.params.id);
    db.exec('BEGIN');
    try {
      for (const kalem of kalemler) {
        const mevcut = db
          .prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?')
          .get(kalem.ilac_id, siparis.sube_id);
        const mevcutStok = mevcut ? mevcut.stok : 0;
        db.prepare(
          `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
           ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = excluded.stok`
        ).run(kalem.ilac_id, siparis.sube_id, mevcutStok + kalem.istenen_adet);
        db.prepare(
          `INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, 'giris', ?, ?)`
        ).run(kalem.ilac_id, siparis.sube_id, kalem.istenen_adet, `Siparis #${siparis.id} teslim alindi`);
      }
      db.prepare('UPDATE siparisler SET durum=?, teslim_tarihi=datetime(\'now\') WHERE id=?').run(durum, req.params.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: 'Teslim alinamadi' });
    }
  } else {
    db.prepare('UPDATE siparisler SET durum=? WHERE id=?').run(durum, req.params.id);
  }

  res.json(db.prepare('SELECT * FROM siparisler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const siparis = db.prepare('SELECT * FROM siparisler WHERE id = ?').get(req.params.id);
  if (!siparis) return res.status(404).json({ error: 'Siparis bulunamadi' });
  if (siparis.durum !== 'beklemede') {
    return res.status(400).json({ error: 'Sadece beklemede durumundaki siparisler silinebilir' });
  }
  db.prepare('DELETE FROM siparisler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
