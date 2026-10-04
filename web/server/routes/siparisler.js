const express = require('express');
const { db } = require('../db');
const { partiGiris } = require('../partiler');

const router = express.Router();

// Akilli siparis onerisi: son 30 gunun net satis hizina (iadeler dusulur) gore
// stogun kac gun yetecegi hesaplanir. Kritik stok altinda olan ya da temin
// suresinden (varsayilan 7 gun) once bitecek urunler onerilir; onerilen adet
// stogu hedef gun sayisina (varsayilan 30) tamamlar.
const ANALIZ_GUN = 30;

function stokYeterlilik(subeId) {
  return db
    .prepare(
      `SELECT i.id AS ilac_id, i.ad, i.barkod, i.kritik_stok, i.alis_fiyati, COALESCE(s.stok, 0) AS stok,
              COALESCE((SELECT SUM(sk.adet) FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
                         WHERE sk.ilac_id = i.id AND sa.sube_id = ? AND sa.tarih >= datetime('now', '-${ANALIZ_GUN} days')), 0)
            - COALESCE((SELECT SUM(ik.adet) FROM iade_kalemleri ik JOIN iadeler ia ON ia.id = ik.iade_id
                         WHERE ik.ilac_id = i.id AND ia.sube_id = ? AND ia.stoga_alindi = 1
                           AND ia.tarih >= datetime('now', '-${ANALIZ_GUN} days')), 0) AS son_satis
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       ORDER BY i.ad`
    )
    .all(subeId, subeId, subeId)
    .map((r) => {
      const gunluk = Math.max(0, r.son_satis) / ANALIZ_GUN;
      return {
        ...r,
        son_satis: Math.max(0, r.son_satis),
        gunluk_ortalama: Math.round(gunluk * 100) / 100,
        yetecek_gun: gunluk > 0 ? Math.floor(r.stok / gunluk) : null
      };
    });
}

router.get('/oneriler', (req, res) => {
  const hedefGun = Math.min(120, Math.max(7, Number(req.query.hedef_gun) || 30));
  const teminGun = Math.min(60, Math.max(1, Number(req.query.temin_gun) || 7));
  const oneriler = stokYeterlilik(req.user.sube_id)
    .filter((r) => r.stok <= r.kritik_stok || (r.yetecek_gun !== null && r.yetecek_gun < teminGun))
    .map((r) => {
      const hizaGore = Math.ceil(r.gunluk_ortalama * hedefGun) - r.stok;
      const kritikeGore = r.kritik_stok * 2 - r.stok;
      const neden = r.stok <= r.kritik_stok ? 'kritik_stok' : 'hizli_tukeniyor';
      return { ...r, neden, onerilen_adet: Math.max(1, hizaGore, kritikeGore) };
    })
    .sort((a, b) => (a.yetecek_gun ?? 9999) - (b.yetecek_gun ?? 9999));
  res.json(oneriler);
});

// Tum urunler icin stok yeterlilik tablosu (rapor/inceleme icin)
router.get('/stok-yeterlilik', (req, res) => {
  res.json(stokYeterlilik(req.user.sube_id));
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
  if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  const kalemler = db.prepare('SELECT * FROM siparis_kalemleri WHERE siparis_id = ?').all(req.params.id);
  res.json({ ...siparis, kalemler });
});

router.post('/', (req, res) => {
  const { tedarikci_id, notlar, kalemler } = req.body;
  if (!tedarikci_id) return res.status(400).json({ error: 'Tedarikçi seçimi zorunludur' });
  if (!Array.isArray(kalemler) || kalemler.length === 0) {
    return res.status(400).json({ error: 'En az bir ilaç eklemelisiniz' });
  }

  const tedarikci = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(tedarikci_id);
  if (!tedarikci) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });

  const hazirlanmis = [];
  for (const k of kalemler) {
    const adet = Number(k.istenen_adet);
    if (!k.ilac_id || !Number.isFinite(adet) || adet <= 0) {
      return res.status(400).json({ error: 'Geçersiz sipariş kalemi' });
    }
    const ilac = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(k.ilac_id);
    if (!ilac) return res.status(404).json({ error: `İlaç bulunamadı: ${k.ilac_id}` });
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
    res.status(500).json({ error: 'Sipariş oluşturulamadı' });
  }
});

router.put('/:id/durum', (req, res) => {
  const siparis = db.prepare('SELECT * FROM siparisler WHERE id = ?').get(req.params.id);
  if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı' });

  const { durum } = req.body;
  if (!['beklemede', 'gonderildi', 'teslim_alindi', 'iptal'].includes(durum)) {
    return res.status(400).json({ error: 'Geçersiz durum' });
  }
  if (siparis.durum === 'teslim_alindi' || siparis.durum === 'iptal') {
    return res.status(400).json({ error: 'Bu sipariş zaten sonuçlandırılmış, durumu değiştirilemez' });
  }

  if (durum === 'teslim_alindi') {
    const kalemler = db.prepare('SELECT * FROM siparis_kalemleri WHERE siparis_id = ?').all(req.params.id);
    // Teslimde her kalem icin parti no / SKT girilebilir: partiler: { [kalem_id]: { parti_no, skt } }
    const partiBilgisi = req.body.partiler && typeof req.body.partiler === 'object' ? req.body.partiler : {};
    for (const bilgi of Object.values(partiBilgisi)) {
      if (bilgi && bilgi.skt && !/^\d{4}-\d{2}-\d{2}$/.test(bilgi.skt)) {
        return res.status(400).json({ error: 'SKT YYYY-AA-GG formatında olmalı' });
      }
    }
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
        const bilgi = partiBilgisi[kalem.id] || {};
        partiGiris(kalem.ilac_id, siparis.sube_id, kalem.istenen_adet, {
          parti_no: bilgi.parti_no,
          skt: bilgi.skt,
          kaynak: `sipariş #${siparis.id}`
        });
        db.prepare(
          `INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, 'giris', ?, ?)`
        ).run(kalem.ilac_id, siparis.sube_id, kalem.istenen_adet, `Sipariş #${siparis.id} teslim alındı`);
      }
      db.prepare('UPDATE siparisler SET durum=?, teslim_tarihi=datetime(\'now\') WHERE id=?').run(durum, req.params.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: 'Teslim alınamadı' });
    }
  } else {
    db.prepare('UPDATE siparisler SET durum=? WHERE id=?').run(durum, req.params.id);
  }

  res.json(db.prepare('SELECT * FROM siparisler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const siparis = db.prepare('SELECT * FROM siparisler WHERE id = ?').get(req.params.id);
  if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  if (siparis.durum !== 'beklemede') {
    return res.status(400).json({ error: 'Sadece beklemede durumundaki siparişler silinebilir' });
  }
  db.prepare('DELETE FROM siparisler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
