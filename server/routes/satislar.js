const express = require('express');
const { db } = require('../db');

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

router.post('/', (req, res) => {
  const { musteri_id, odeme_tipi, sgk_recete, kalemler } = req.body;
  const subeId = req.user.sube_id;

  if (!Array.isArray(kalemler) || kalemler.length === 0) {
    return res.status(400).json({ error: 'Sepet bos olamaz' });
  }

  const hazirlanmis = [];
  for (const kalem of kalemler) {
    const adet = Number(kalem.adet);
    if (!kalem.ilac_id || !Number.isFinite(adet) || adet <= 0) {
      return res.status(400).json({ error: 'Gecersiz sepet kalemi' });
    }
    const ilac = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(kalem.ilac_id);
    if (!ilac) return res.status(404).json({ error: `Ilac bulunamadi: ${kalem.ilac_id}` });

    const stokRow = db
      .prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?')
      .get(kalem.ilac_id, subeId);
    const mevcutStok = stokRow ? stokRow.stok : 0;
    if (mevcutStok < adet) {
      return res.status(400).json({ error: `Yetersiz stok: ${ilac.ad} (mevcut: ${mevcutStok})` });
    }

    hazirlanmis.push({ ilac, adet, mevcutStok });
  }

  const toplamTutar = hazirlanmis.reduce((sum, k) => sum + k.adet * k.ilac.satis_fiyati, 0);

  db.exec('BEGIN');
  try {
    const satisInfo = db
      .prepare(
        `INSERT INTO satislar (musteri_id, sube_id, kullanici_id, toplam_tutar, odeme_tipi, sgk_recete)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(musteri_id || null, subeId, req.user.id, toplamTutar, odeme_tipi || 'nakit', sgk_recete ? 1 : 0);

    const satisId = satisInfo.lastInsertRowid;
    const insertKalem = db.prepare(
      `INSERT INTO satis_kalemleri (satis_id, ilac_id, ilac_adi, adet, birim_fiyat, alis_fiyati, ara_toplam)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const updateStok = db.prepare('UPDATE ilac_stok SET stok = ? WHERE ilac_id = ? AND sube_id = ?');
    const insertHareket = db.prepare(
      `INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, 'cikis', ?, ?)`
    );

    for (const { ilac, adet, mevcutStok } of hazirlanmis) {
      insertKalem.run(satisId, ilac.id, ilac.ad, adet, ilac.satis_fiyati, ilac.alis_fiyati, adet * ilac.satis_fiyati);
      updateStok.run(mevcutStok - adet, ilac.id, subeId);
      insertHareket.run(ilac.id, subeId, adet, `Satis #${satisId}`);
    }

    db.exec('COMMIT');

    const satis = db.prepare('SELECT * FROM satislar WHERE id = ?').get(satisId);
    const items = db.prepare('SELECT * FROM satis_kalemleri WHERE satis_id = ?').all(satisId);
    const dusukStokUyarisi = hazirlanmis
      .filter((k) => k.mevcutStok - k.adet <= k.ilac.kritik_stok)
      .map((k) => ({ ilac_id: k.ilac.id, ad: k.ilac.ad, kalan_stok: k.mevcutStok - k.adet }));

    res.status(201).json({ ...satis, kalemler: items, kritik_stok_uyarisi: dusukStokUyarisi });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Satis olusturulamadi' });
  }
});

router.get('/', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { baslangic, bitis, musteri_id } = req.query;

  let sql = `
    SELECT sa.*, m.ad_soyad AS musteri_adi, k.ad_soyad AS satan_kullanici, s.ad AS sube_adi
    FROM satislar sa
    LEFT JOIN musteriler m ON m.id = sa.musteri_id
    LEFT JOIN kullanicilar k ON k.id = sa.kullanici_id
    LEFT JOIN subeler s ON s.id = sa.sube_id
    WHERE 1=1
  `;
  const params = [];
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  if (baslangic) {
    sql += ' AND sa.tarih >= ?';
    params.push(baslangic);
  }
  if (bitis) {
    sql += ' AND sa.tarih <= ?';
    params.push(bitis);
  }
  if (musteri_id) {
    sql += ' AND sa.musteri_id = ?';
    params.push(Number(musteri_id));
  }
  sql += ' ORDER BY sa.tarih DESC LIMIT 500';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const satis = db.prepare('SELECT * FROM satislar WHERE id = ?').get(req.params.id);
  if (!satis) return res.status(404).json({ error: 'Satis bulunamadi' });
  const kalemler = db.prepare('SELECT * FROM satis_kalemleri WHERE satis_id = ?').all(req.params.id);
  res.json({ ...satis, kalemler });
});

module.exports = router;
