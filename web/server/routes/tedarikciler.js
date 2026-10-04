const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');

const yonetici = requireRole('admin', 'eczaci');
const yuvarla = (n) => Math.round(n * 100) / 100;
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

function vadeGunOku(deger, varsayilan) {
  if (deger === undefined) return varsayilan;
  const n = Number(deger);
  return Number.isInteger(n) && n >= 0 && n <= 365 ? n : NaN;
}

const router = express.Router();

router.get('/', (req, res) => {
  const { q } = req.query;
  if (q) {
    const like = `%${q}%`;
    return res.json(
      db
        .prepare('SELECT * FROM tedarikciler WHERE firma_adi LIKE ? OR yetkili LIKE ? ORDER BY firma_adi')
        .all(like, like)
    );
  }
  res.json(db.prepare('SELECT * FROM tedarikciler ORDER BY firma_adi').all());
});

// ---- Tedarikci cari hesabi: faturalar borc, odemeler alacak ----
function cariBakiye(tedarikciId, subeId) {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN tip = 'fatura' THEN tutar ELSE -tutar END), 0) AS b
       FROM tedarikci_hareketleri WHERE tedarikci_id = ? ${subeId ? 'AND sube_id = ?' : ''}`
    )
    .get(...(subeId ? [tedarikciId, subeId] : [tedarikciId]));
  return yuvarla(r.b);
}

// Odemeler faturalara vade sirasiyla (eskiden yeniye) dagitilir; acik kalan tutarlar doner
function acikFaturalar(tedarikciId, subeId) {
  const faturalar = db
    .prepare(
      `SELECT * FROM tedarikci_hareketleri WHERE tedarikci_id = ? AND sube_id = ? AND tip = 'fatura'
       ORDER BY COALESCE(vade_tarihi, belge_tarihi, date(tarih)), id`
    )
    .all(tedarikciId, subeId);
  let odenen = db
    .prepare("SELECT COALESCE(SUM(tutar), 0) AS t FROM tedarikci_hareketleri WHERE tedarikci_id = ? AND sube_id = ? AND tip = 'odeme'")
    .get(tedarikciId, subeId).t;
  const acik = [];
  for (const f of faturalar) {
    const kapanan = Math.min(odenen, f.tutar);
    odenen -= kapanan;
    const kalan = yuvarla(f.tutar - kapanan);
    if (kalan > 0.005) acik.push({ ...f, kalan });
  }
  return acik;
}

router.get('/vadeler/liste', yonetici, (req, res) => {
  const gun = Math.min(Math.max(Number(req.query.gun) || 30, 1), 365);
  const sinir = new Date(Date.now() + gun * 86400000).toISOString().slice(0, 10);
  const bugun = new Date().toISOString().slice(0, 10);
  const tedarikciler = db.prepare('SELECT id, firma_adi FROM tedarikciler').all();
  const liste = [];
  for (const t of tedarikciler) {
    for (const f of acikFaturalar(t.id, req.user.sube_id)) {
      const vade = f.vade_tarihi || f.belge_tarihi || f.tarih.slice(0, 10);
      if (vade <= sinir) liste.push({ ...f, firma_adi: t.firma_adi, vade, gecikmis: vade < bugun });
    }
  }
  liste.sort((a, b) => a.vade.localeCompare(b.vade));
  res.json({ liste, toplam: yuvarla(liste.reduce((s, f) => s + f.kalan, 0)) });
});

router.get('/:id/cari', yonetici, (req, res) => {
  const t = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });
  const hareketler = db
    .prepare(
      `SELECT h.*, k.ad_soyad AS kullanici_adi FROM tedarikci_hareketleri h LEFT JOIN kullanicilar k ON k.id = h.kullanici_id
       WHERE h.tedarikci_id = ? AND h.sube_id = ? ORDER BY h.tarih DESC, h.id DESC`
    )
    .all(t.id, req.user.sube_id);
  res.json({ tedarikci: t, bakiye: cariBakiye(t.id, req.user.sube_id), acik_faturalar: acikFaturalar(t.id, req.user.sube_id), hareketler });
});

const ODEME_SEKILLERI = ['havale', 'nakit', 'kredi_karti', 'cek', 'senet'];
router.post('/:id/hareketler', yonetici, (req, res) => {
  const t = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });
  const { tip } = req.body;
  const tutar = yuvarla(Number(req.body.tutar));
  if (!['fatura', 'odeme'].includes(tip)) return res.status(400).json({ error: 'Hareket tipi fatura veya ödeme olmalı' });
  if (!(tutar > 0)) return res.status(400).json({ error: 'Geçerli bir tutar girin' });
  const belgeTarihi = req.body.belge_tarihi || new Date().toISOString().slice(0, 10);
  if (!TARIH.test(belgeTarihi)) return res.status(400).json({ error: 'Belge tarihi geçersiz' });
  let vade = null;
  if (tip === 'fatura') {
    vade = req.body.vade_tarihi || new Date(new Date(belgeTarihi + 'T00:00:00Z').getTime() + t.vade_gun * 86400000).toISOString().slice(0, 10);
    if (!TARIH.test(vade)) return res.status(400).json({ error: 'Vade tarihi geçersiz' });
  }
  const odemeSekli = tip === 'odeme' ? req.body.odeme_sekli || 'havale' : null;
  if (odemeSekli && !ODEME_SEKILLERI.includes(odemeSekli)) return res.status(400).json({ error: 'Geçersiz ödeme şekli' });
  const info = db
    .prepare(
      `INSERT INTO tedarikci_hareketleri (tedarikci_id, sube_id, tip, tutar, belge_no, belge_tarihi, vade_tarihi, odeme_sekli, aciklama, kullanici_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(t.id, req.user.sube_id, tip, tutar, req.body.belge_no || null, belgeTarihi, vade, odemeSekli, req.body.aciklama || null, req.user.id);
  res.status(201).json({ hareket: db.prepare('SELECT * FROM tedarikci_hareketleri WHERE id = ?').get(info.lastInsertRowid), bakiye: cariBakiye(t.id, req.user.sube_id) });
});

router.delete('/hareketler/:id', requireRole('admin'), (req, res) => {
  const h = db.prepare('SELECT * FROM tedarikci_hareketleri WHERE id = ? AND sube_id = ?').get(req.params.id, req.user.sube_id);
  if (!h) return res.status(404).json({ error: 'Hareket bulunamadı' });
  if (h.mal_kabul_id) return res.status(409).json({ error: 'Mal kabulden oluşan fatura buradan silinemez' });
  db.prepare('DELETE FROM tedarikci_hareketleri WHERE id = ?').run(h.id);
  res.status(204).end();
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });
  res.json(row);
});

router.post('/', yonetici, (req, res) => {
  const { firma_adi, yetkili, telefon, email } = req.body;
  if (!firma_adi || !firma_adi.trim()) return res.status(400).json({ error: 'Firma adı zorunludur' });
  const vadeGun = vadeGunOku(req.body.vade_gun, 30);
  if (Number.isNaN(vadeGun)) return res.status(400).json({ error: 'Vade günü 0-365 arasında olmalı' });

  const info = db
    .prepare('INSERT INTO tedarikciler (firma_adi, yetkili, telefon, email, vade_gun) VALUES (?, ?, ?, ?, ?)')
    .run(firma_adi.trim(), yetkili || null, telefon || null, email || null, vadeGun);
  res.status(201).json(db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', yonetici, (req, res) => {
  const existing = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });

  const { firma_adi, yetkili, telefon, email } = req.body;
  if (!firma_adi || !firma_adi.trim()) return res.status(400).json({ error: 'Firma adı zorunludur' });
  const vadeGun = vadeGunOku(req.body.vade_gun, existing.vade_gun);
  if (Number.isNaN(vadeGun)) return res.status(400).json({ error: 'Vade günü 0-365 arasında olmalı' });

  db.prepare('UPDATE tedarikciler SET firma_adi=?, yetkili=?, telefon=?, email=?, vade_gun=? WHERE id=?').run(
    firma_adi.trim(),
    yetkili || null,
    telefon || null,
    email || null,
    vadeGun,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id));
});

router.delete('/:id', yonetici, (req, res) => {
  const existing = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });
  if (Math.abs(cariBakiye(existing.id)) > 0.005) {
    return res.status(409).json({ error: 'Cari bakiyesi kapanmamış tedarikçi silinemez' });
  }
  db.prepare('DELETE FROM tedarikciler WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
module.exports.cariBakiye = cariBakiye;
module.exports.acikFaturalar = acikFaturalar;
