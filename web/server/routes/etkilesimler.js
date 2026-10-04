const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { etkilesimleriBul, alerjiKontrol, hastaUyarilari, ciftAnahtari, normallestir } = require('../etkilesim');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare("SELECT * FROM etkilesimler ORDER BY CASE seviye WHEN 'ciddi' THEN 0 WHEN 'orta' THEN 1 ELSE 2 END, madde_a").all());
});

// Sepet (ve secildiyse musterinin son 90 gunluk alimlari) icin etkilesim kontrolu
router.post('/kontrol', (req, res) => {
  const ids = [...new Set((req.body.ilac_ids || []).map(Number).filter(Boolean))];
  const getir = db.prepare('SELECT id, ad, etken_madde, gebelik_uyari, min_yas, yasli_uyari FROM ilaclar WHERE id = ?');
  const sepet = ids.map((id) => getir.get(id)).filter(Boolean).map((u) => ({ ...u, kaynak: 'sepet' }));

  let gecmis = [];
  let alerji = [];
  let hasta = [];
  const musteriId = Number(req.body.musteri_id) || null;
  if (musteriId) {
    gecmis = db
      .prepare(
        `SELECT DISTINCT i.id, i.ad, i.etken_madde
         FROM satis_kalemleri sk
         JOIN satislar sa ON sa.id = sk.satis_id
         JOIN ilaclar i ON i.id = sk.ilac_id
         WHERE sa.musteri_id = ? AND sa.tarih >= datetime('now', '-90 days')`
      )
      .all(musteriId)
      .filter((u) => !ids.includes(u.id))
      .map((u) => ({ ...u, kaynak: 'gecmis' }));
    const musteri = db.prepare('SELECT saglik_notu, dogum_tarihi, gebelik_durumu FROM musteriler WHERE id = ?').get(musteriId);
    alerji = alerjiKontrol(musteri && musteri.saglik_notu, sepet);
    hasta = hastaUyarilari(musteri, sepet);
  }

  const { etkilesimler, mukerrer } = etkilesimleriBul([...sepet, ...gecmis]);
  res.json({ etkilesimler, mukerrer, alerji, hasta });
});

router.post('/', requireRole('admin', 'eczaci'), (req, res) => {
  const a = normallestir(req.body.madde_a);
  const b = normallestir(req.body.madde_b);
  const { seviye, aciklama } = req.body;
  if (!a || !b || a === b) return res.status(400).json({ error: 'İki farklı etken madde girin' });
  if (!['ciddi', 'orta', 'hafif'].includes(seviye)) return res.status(400).json({ error: 'Geçersiz seviye' });
  if (!aciklama || !String(aciklama).trim()) return res.status(400).json({ error: 'Açıklama zorunludur' });
  const [x, y] = ciftAnahtari(a, b);
  try {
    const info = db
      .prepare('INSERT INTO etkilesimler (madde_a, madde_b, seviye, aciklama) VALUES (?, ?, ?, ?)')
      .run(x, y, seviye, String(aciklama).trim());
    res.status(201).json(db.prepare('SELECT * FROM etkilesimler WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu etkileşim zaten kayıtlı' });
    res.status(500).json({ error: 'Etkileşim eklenemedi' });
  }
});

router.delete('/:id', requireRole('admin', 'eczaci'), (req, res) => {
  const info = db.prepare('DELETE FROM etkilesimler WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Etkileşim bulunamadı' });
  res.status(204).end();
});

module.exports = router;
