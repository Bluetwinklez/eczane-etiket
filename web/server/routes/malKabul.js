const express = require('express');
const { db } = require('../db');
const { partiGiris } = require('../partiler');

const router = express.Router();
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

function yuvarla(n) {
  return Math.round(n * 100) / 100;
}

function kabulGetir(id) {
  const k = db
    .prepare(
      `SELECT mk.*, t.firma_adi AS tedarikci_adi, u.ad_soyad AS kullanici_adi
       FROM mal_kabulleri mk
       LEFT JOIN tedarikciler t ON t.id = mk.tedarikci_id
       LEFT JOIN kullanicilar u ON u.id = mk.kullanici_id
       WHERE mk.id = ?`
    )
    .get(id);
  if (!k) return null;
  k.kalemler = db
    .prepare(
      `SELECT mkk.*, i.ad AS ilac_adi FROM mal_kabul_kalemleri mkk JOIN ilaclar i ON i.id = mkk.ilac_id
       WHERE mkk.mal_kabul_id = ? ORDER BY mkk.id`
    )
    .all(id);
  return k;
}

router.get('/', (req, res) => {
  let sql = `
    SELECT mk.*, t.firma_adi AS tedarikci_adi, u.ad_soyad AS kullanici_adi,
           (SELECT COUNT(*) FROM mal_kabul_kalemleri WHERE mal_kabul_id = mk.id) AS kalem_sayisi,
           (SELECT SUM(adet + mf) FROM mal_kabul_kalemleri WHERE mal_kabul_id = mk.id) AS toplam_adet
    FROM mal_kabulleri mk
    LEFT JOIN tedarikciler t ON t.id = mk.tedarikci_id
    LEFT JOIN kullanicilar u ON u.id = mk.kullanici_id
    WHERE 1=1`;
  const params = [];
  if (req.user.rol !== 'admin') {
    sql += ' AND mk.sube_id = ?';
    params.push(req.user.sube_id);
  }
  sql += ' ORDER BY mk.id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const k = kabulGetir(req.params.id);
  if (!k || (req.user.rol !== 'admin' && k.sube_id !== req.user.sube_id)) {
    return res.status(404).json({ error: 'Mal kabul bulunamadı' });
  }
  res.json(k);
});

router.post('/', (req, res) => {
  const { tedarikci_id, siparis_id, fatura_no, fatura_tarihi } = req.body;
  const alisGuncelle = req.body.alis_fiyati_guncelle !== false;
  const subeId = req.user.sube_id;

  if (tedarikci_id && !db.prepare('SELECT id FROM tedarikciler WHERE id = ?').get(tedarikci_id)) {
    return res.status(400).json({ error: 'Tedarikçi bulunamadı' });
  }
  if (fatura_tarihi && !TARIH.test(fatura_tarihi)) return res.status(400).json({ error: 'Fatura tarihi geçersiz' });

  let siparis = null;
  if (siparis_id) {
    siparis = db.prepare('SELECT * FROM siparisler WHERE id = ?').get(siparis_id);
    if (!siparis || siparis.sube_id !== subeId) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    if (!['beklemede', 'gonderildi'].includes(siparis.durum)) {
      return res.status(400).json({ error: 'Sipariş zaten sonuçlanmış' });
    }
  }

  const kalemler = Array.isArray(req.body.kalemler) ? req.body.kalemler : [];
  if (!kalemler.length) return res.status(400).json({ error: 'En az bir kalem girin' });
  const hazir = [];
  for (const k of kalemler) {
    const ilac = db.prepare('SELECT id, ad FROM ilaclar WHERE id = ?').get(Number(k.ilac_id));
    if (!ilac) return res.status(404).json({ error: `Ürün bulunamadı: ${k.ilac_id}` });
    const adet = Number(k.adet);
    const mf = Number(k.mf || 0);
    const alis = Number(k.alis_fiyati);
    if (!Number.isInteger(adet) || adet <= 0) return res.status(400).json({ error: `${ilac.ad}: adet geçersiz` });
    if (!Number.isInteger(mf) || mf < 0) return res.status(400).json({ error: `${ilac.ad}: mal fazlası geçersiz` });
    if (!Number.isFinite(alis) || alis < 0) return res.status(400).json({ error: `${ilac.ad}: alış fiyatı geçersiz` });
    if (k.skt && !TARIH.test(k.skt)) return res.status(400).json({ error: `${ilac.ad}: SKT geçersiz` });
    hazir.push({ ilac, adet, mf, alis, birim: yuvarla((alis * adet) / (adet + mf)), parti_no: k.parti_no || null, skt: k.skt || null });
  }
  const toplam = yuvarla(hazir.reduce((t, k) => t + k.alis * k.adet, 0));

  db.exec('BEGIN');
  try {
    const kabulId = Number(
      db
        .prepare(
          `INSERT INTO mal_kabulleri (sube_id, tedarikci_id, siparis_id, fatura_no, fatura_tarihi, toplam_tutar, kullanici_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(subeId, tedarikci_id || (siparis && siparis.tedarikci_id) || null, siparis ? siparis.id : null, fatura_no || null, fatura_tarihi || null, toplam, req.user.id)
        .lastInsertRowid
    );
    const kalemEkle = db.prepare(
      `INSERT INTO mal_kabul_kalemleri (mal_kabul_id, ilac_id, adet, mf, alis_fiyati, birim_maliyet, parti_no, skt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const k of hazir) {
      const giren = k.adet + k.mf;
      kalemEkle.run(kabulId, k.ilac.id, k.adet, k.mf, k.alis, k.birim, k.parti_no, k.skt);
      db.prepare(
        `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
         ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = stok + excluded.stok`
      ).run(k.ilac.id, subeId, giren);
      partiGiris(k.ilac.id, subeId, giren, { parti_no: k.parti_no, skt: k.skt, kaynak: `mal kabul #${kabulId}` });
      db.prepare('INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, ?, ?, ?)').run(
        k.ilac.id,
        subeId,
        'giris',
        giren,
        `Mal kabul #${kabulId}${fatura_no ? ` (fatura ${fatura_no})` : ''}${k.mf ? ` ${k.adet}+${k.mf} MF` : ''}`
      );
      // Kar hesaplari icin urunun alis fiyati MF dahil gercek birim maliyete cekilir
      if (alisGuncelle) db.prepare('UPDATE ilaclar SET alis_fiyati = ? WHERE id = ?').run(k.birim, k.ilac.id);
    }
    if (siparis) {
      db.prepare("UPDATE siparisler SET durum = 'teslim_alindi', teslim_tarihi = datetime('now') WHERE id = ?").run(siparis.id);
    }
    // Faturali mal kabul tedarikci cari hesabina borc olarak islenir (vade: fatura tarihi + tedarikci vade gunu)
    const tedarikciId = tedarikci_id || (siparis && siparis.tedarikci_id) || null;
    const tedarikci = tedarikciId ? db.prepare('SELECT id, vade_gun FROM tedarikciler WHERE id = ?').get(tedarikciId) : null;
    if (tedarikci && toplam > 0) {
      const belgeTarihi = fatura_tarihi || new Date().toISOString().slice(0, 10);
      const vade = new Date(new Date(belgeTarihi + 'T00:00:00Z').getTime() + (tedarikci.vade_gun ?? 30) * 86400000).toISOString().slice(0, 10);
      db.prepare(
        `INSERT INTO tedarikci_hareketleri (tedarikci_id, sube_id, tip, tutar, belge_no, belge_tarihi, vade_tarihi, aciklama, mal_kabul_id, kullanici_id)
         VALUES (?, ?, 'fatura', ?, ?, ?, ?, ?, ?, ?)`
      ).run(tedarikci.id, subeId, toplam, fatura_no || null, belgeTarihi, vade, `Mal kabul #${kabulId}`, kabulId, req.user.id);
    }
    db.exec('COMMIT');
    res.status(201).json(kabulGetir(kabulId));
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Mal kabul kaydedilemedi' });
  }
});

module.exports = router;
