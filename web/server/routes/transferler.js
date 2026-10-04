const express = require('express');
const { db } = require('../db');
const { partiGiris, partiCikis } = require('../partiler');

const router = express.Router();

function stokDegistir(ilacId, subeId, fark, tip, aciklama) {
  db.prepare(
    `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
     ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = stok + excluded.stok`
  ).run(ilacId, subeId, fark);
  db.prepare('INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, ?, ?, ?)').run(
    ilacId,
    subeId,
    tip,
    Math.abs(fark),
    aciklama
  );
}

function transferGetir(id) {
  const t = db
    .prepare(
      `SELECT t.*, k.ad AS kaynak_sube, h.ad AS hedef_sube, g.ad_soyad AS gonderen, a.ad_soyad AS teslim_alan
       FROM transferler t
       JOIN subeler k ON k.id = t.kaynak_sube_id
       JOIN subeler h ON h.id = t.hedef_sube_id
       LEFT JOIN kullanicilar g ON g.id = t.gonderen_id
       LEFT JOIN kullanicilar a ON a.id = t.teslim_alan_id
       WHERE t.id = ?`
    )
    .get(id);
  if (!t) return null;
  t.kalemler = db
    .prepare(
      `SELECT tk.*, i.ad AS ilac_adi FROM transfer_kalemleri tk JOIN ilaclar i ON i.id = tk.ilac_id
       WHERE tk.transfer_id = ? ORDER BY i.ad, tk.skt`
    )
    .all(id);
  return t;
}

function yetkiliMi(req, t, taraf) {
  if (req.user.rol === 'admin') return true;
  if (taraf === 'kaynak') return t.kaynak_sube_id === req.user.sube_id;
  if (taraf === 'hedef') return t.hedef_sube_id === req.user.sube_id;
  return t.kaynak_sube_id === req.user.sube_id || t.hedef_sube_id === req.user.sube_id;
}

// Transfer formu icin sube listesi (sube yonetimi sayfasi yalnizca admin'e acik)
router.get('/subeler', (req, res) => {
  res.json(db.prepare('SELECT id, ad FROM subeler ORDER BY id').all());
});

router.get('/', (req, res) => {
  let sql = `
    SELECT t.*, k.ad AS kaynak_sube, h.ad AS hedef_sube, g.ad_soyad AS gonderen,
           (SELECT SUM(adet) FROM transfer_kalemleri WHERE transfer_id = t.id) AS toplam_adet,
           (SELECT GROUP_CONCAT(DISTINCT i.ad) FROM transfer_kalemleri tk JOIN ilaclar i ON i.id = tk.ilac_id
             WHERE tk.transfer_id = t.id) AS urunler
    FROM transferler t
    JOIN subeler k ON k.id = t.kaynak_sube_id
    JOIN subeler h ON h.id = t.hedef_sube_id
    LEFT JOIN kullanicilar g ON g.id = t.gonderen_id
    WHERE 1=1`;
  const params = [];
  if (req.user.rol !== 'admin') {
    sql += ' AND (t.kaynak_sube_id = ? OR t.hedef_sube_id = ?)';
    params.push(req.user.sube_id, req.user.sube_id);
  }
  sql += ' ORDER BY t.id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const t = transferGetir(req.params.id);
  if (!t || !yetkiliMi(req, t)) return res.status(404).json({ error: 'Transfer bulunamadi' });
  res.json(t);
});

router.post('/', (req, res) => {
  const kaynak = req.user.rol === 'admin' && req.body.kaynak_sube_id ? Number(req.body.kaynak_sube_id) : req.user.sube_id;
  const hedef = Number(req.body.hedef_sube_id);
  if (!db.prepare('SELECT id FROM subeler WHERE id = ?').get(hedef)) return res.status(400).json({ error: 'Hedef sube bulunamadi' });
  if (hedef === kaynak) return res.status(400).json({ error: 'Kaynak ve hedef sube ayni olamaz' });

  const kalemler = Array.isArray(req.body.kalemler) ? req.body.kalemler : [];
  const birlesik = new Map();
  for (const k of kalemler) {
    const adet = Number(k.adet);
    if (!Number.isInteger(adet) || adet <= 0) return res.status(400).json({ error: 'Gecersiz adet' });
    birlesik.set(Number(k.ilac_id), (birlesik.get(Number(k.ilac_id)) || 0) + adet);
  }
  if (!birlesik.size) return res.status(400).json({ error: 'En az bir urun ekleyin' });

  const stokOku = db.prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?');
  for (const [ilacId, adet] of birlesik) {
    const ilac = db.prepare('SELECT ad FROM ilaclar WHERE id = ?').get(ilacId);
    if (!ilac) return res.status(404).json({ error: `Urun bulunamadi: ${ilacId}` });
    const stok = (stokOku.get(ilacId, kaynak) || { stok: 0 }).stok;
    if (stok < adet) return res.status(400).json({ error: `Yetersiz stok: ${ilac.ad} (mevcut: ${stok})` });
  }

  const hedefAdi = db.prepare('SELECT ad FROM subeler WHERE id = ?').get(hedef).ad;
  db.exec('BEGIN');
  try {
    const transferId = Number(
      db
        .prepare('INSERT INTO transferler (kaynak_sube_id, hedef_sube_id, gonderen_id, aciklama) VALUES (?, ?, ?, ?)')
        .run(kaynak, hedef, req.user.id, req.body.aciklama || null).lastInsertRowid
    );
    const partiOku = db.prepare('SELECT parti_no, skt FROM ilac_partileri WHERE id = ?');
    const kalemEkle = db.prepare('INSERT INTO transfer_kalemleri (transfer_id, ilac_id, adet, parti_no, skt) VALUES (?, ?, ?, ?, ?)');
    for (const [ilacId, adet] of birlesik) {
      stokDegistir(ilacId, kaynak, -adet, 'cikis', `Transfer #${transferId} -> ${hedefAdi}`);
      // SKT'si en yakin partiler gonderilir; parti bilgisi hedefe tasinir
      let kalan = adet;
      for (const d of partiCikis(ilacId, kaynak, adet)) {
        const p = partiOku.get(d.parti_id);
        kalemEkle.run(transferId, ilacId, d.adet, p.parti_no, p.skt);
        kalan -= d.adet;
      }
      if (kalan > 0) kalemEkle.run(transferId, ilacId, kalan, null, null);
    }
    db.exec('COMMIT');
    res.status(201).json(transferGetir(transferId));
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Transfer olusturulamadi' });
  }
});

function transferiKapat(req, res, yeniDurum) {
  const t = transferGetir(req.params.id);
  if (!t || !yetkiliMi(req, t)) return res.status(404).json({ error: 'Transfer bulunamadi' });
  if (t.durum !== 'yolda') return res.status(400).json({ error: 'Transfer zaten sonuclanmis' });
  const teslim = yeniDurum === 'teslim_alindi';
  if (!yetkiliMi(req, t, teslim ? 'hedef' : 'kaynak')) {
    return res.status(403).json({ error: teslim ? 'Yalnizca alici sube teslim alabilir' : 'Yalnizca gonderen sube iptal edebilir' });
  }

  // Teslimde hedefe, iptalde kaynaga ayni parti/SKT ile girer
  const subeId = teslim ? t.hedef_sube_id : t.kaynak_sube_id;
  const aciklama = teslim ? `Transfer #${t.id} <- ${t.kaynak_sube}` : `Transfer #${t.id} iptal`;
  db.exec('BEGIN');
  try {
    for (const k of t.kalemler) {
      stokDegistir(k.ilac_id, subeId, k.adet, 'giris', aciklama);
      partiGiris(k.ilac_id, subeId, k.adet, { parti_no: k.parti_no, skt: k.skt, kaynak: `transfer #${t.id}` });
    }
    db.prepare(
      `UPDATE transferler SET durum = ?, teslim_tarihi = datetime('now'), teslim_alan_id = ? WHERE id = ?`
    ).run(yeniDurum, req.user.id, t.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Transfer guncellenemedi' });
  }
  res.json(transferGetir(t.id));
}

router.post('/:id/teslim-al', (req, res) => transferiKapat(req, res, 'teslim_alindi'));
router.post('/:id/iptal', (req, res) => transferiKapat(req, res, 'iptal'));

module.exports = router;
