// e-Arsiv fatura taslaklari: satistan UBL-TR XML uretme, indirme ve fatura bilgileri ayarlari.
const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const eArsiv = require('../eArsiv');

const router = express.Router();
const yonetici = requireRole('admin', 'eczaci');
const ozet = ({ xml: _xml, ...f }) => f; // liste/ozet yanitlarinda XML gonderilmez

router.get('/ayarlar', yonetici, (req, res) => {
  const a = eArsiv.ayarlar();
  res.json({ ...a, eksik: eArsiv.ayarHatasi(a) });
});

router.put('/ayarlar', requireRole('admin'), (req, res) => {
  try {
    const a = eArsiv.ayarlariYaz(req.body || {});
    res.json({ ...a, eksik: eArsiv.ayarHatasi(a) });
  } catch (err) {
    if (err.kullanici) return res.status(400).json({ error: err.message });
    throw err;
  }
});

router.get('/', yonetici, (req, res) => {
  const sube = req.user.rol === 'admin' && req.query.sube_id ? Number(req.query.sube_id) : req.user.sube_id;
  const ay = /^\d{4}-\d{2}$/.test(req.query.ay || '') ? req.query.ay : null;
  const liste = db
    .prepare(
      `SELECT id, satis_id, fatura_no, ettn, tarih, alici_ad, alici_kimlik, kdv_haric, kdv, toplam FROM e_arsiv_faturalari
       WHERE sube_id = ? ${ay ? 'AND substr(tarih, 1, 7) = ?' : ''} ORDER BY fatura_no DESC LIMIT 500`
    )
    .all(...(ay ? [sube, ay] : [sube]));
  res.json(liste);
});

// Kasiyer de kendi subesindeki satisa fatura olusturabilir (musteri kasada fatura isteyebilir)
function satisErisimi(req, res) {
  const satis = db.prepare('SELECT id, sube_id FROM satislar WHERE id = ?').get(req.params.satisId);
  if (!satis) {
    res.status(404).json({ error: 'Satış bulunamadı' });
    return null;
  }
  if (req.user.rol !== 'admin' && satis.sube_id !== req.user.sube_id) {
    res.status(403).json({ error: 'Bu satış başka şubeye ait' });
    return null;
  }
  return satis;
}

router.get('/satis/:satisId', (req, res) => {
  if (!satisErisimi(req, res)) return;
  const f = db.prepare('SELECT * FROM e_arsiv_faturalari WHERE satis_id = ?').get(req.params.satisId);
  res.json(f ? ozet(f) : null);
});

router.post('/satis/:satisId', (req, res) => {
  if (!satisErisimi(req, res)) return;
  try {
    const { fatura, yeni } = eArsiv.faturaOlustur(Number(req.params.satisId), { kullaniciId: req.user.id, alici: req.body && req.body.alici });
    res.status(yeni ? 201 : 200).json({ ...ozet(fatura), yeni });
  } catch (err) {
    if (err.kullanici) return res.status(400).json({ error: err.message });
    if (err.durum) return res.status(err.durum).json({ error: err.message });
    throw err;
  }
});

router.get('/satis/:satisId/xml', (req, res) => {
  if (!satisErisimi(req, res)) return;
  const f = db.prepare('SELECT fatura_no, xml FROM e_arsiv_faturalari WHERE satis_id = ?').get(req.params.satisId);
  if (!f) return res.status(404).json({ error: 'Bu satış için fatura oluşturulmamış' });
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${f.fatura_no}.xml"`);
  res.send(f.xml);
});

module.exports = router;
