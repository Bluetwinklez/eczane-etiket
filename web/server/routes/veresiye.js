const express = require('express');
const { db } = require('../db');
const { musteriBakiyesi, cariHareketEkle, yuvarla } = require('../cari');

const router = express.Router();

// Bakiyesi olan (veya hic hareketi olan) musteriler, en yuksek borc once
router.get('/', (req, res) => {
  const tumu = req.query.tumu === '1';
  const rows = db
    .prepare(
      `SELECT m.id, m.ad_soyad, m.telefon, m.veresiye_limiti,
              ROUND(SUM(CASE WHEN c.tip = 'borc' THEN c.tutar ELSE -c.tutar END), 2) AS bakiye,
              MAX(c.tarih) AS son_hareket,
              MAX(CASE WHEN c.tip = 'tahsilat' THEN c.tarih END) AS son_tahsilat,
              MIN(CASE WHEN c.tip = 'borc' THEN c.tarih END) AS ilk_borc
       FROM musteriler m
       JOIN cari_hareketler c ON c.musteri_id = m.id
       GROUP BY m.id
       ${tumu ? '' : 'HAVING ABS(bakiye) > 0.001'}
       ORDER BY bakiye DESC`
    )
    .all();

  const bugun = Date.now();
  const sonuc = rows.map((r) => {
    // Son tahsilattan (hic yoksa ilk borctan) bu yana gecen gun: takip onceligi icin
    const referans = r.son_tahsilat || r.ilk_borc;
    const bekleyenGun = referans ? Math.floor((bugun - new Date(referans.replace(' ', 'T') + 'Z')) / 86400000) : 0;
    return {
      ...r,
      bekleyen_gun: r.bakiye > 0 ? bekleyenGun : 0,
      limit_asimi: r.veresiye_limiti != null && r.bakiye > r.veresiye_limiti
    };
  });

  const ayBasi = new Date().toISOString().slice(0, 7) + '-01';
  const buAyTahsilat = db
    .prepare("SELECT COALESCE(SUM(tutar), 0) AS t FROM cari_hareketler WHERE tip = 'tahsilat' AND tarih >= ?")
    .get(ayBasi).t;

  res.json({
    musteriler: sonuc,
    ozet: {
      toplam_alacak: yuvarla(sonuc.reduce((t, r) => t + Math.max(0, r.bakiye), 0)),
      borclu_musteri: sonuc.filter((r) => r.bakiye > 0.001).length,
      bu_ay_tahsilat: yuvarla(buAyTahsilat),
      otuz_gun_ustu: sonuc.filter((r) => r.bekleyen_gun > 30).length
    }
  });
});

router.get('/:musteriId', (req, res) => {
  const musteri = db.prepare('SELECT id, ad_soyad, telefon, veresiye_limiti FROM musteriler WHERE id = ?').get(req.params.musteriId);
  if (!musteri) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  const hareketler = db
    .prepare(
      `SELECT c.*, u.ad_soyad AS kullanici_adi, s.ad AS sube_adi
       FROM cari_hareketler c
       LEFT JOIN kullanicilar u ON u.id = c.kullanici_id
       LEFT JOIN subeler s ON s.id = c.sube_id
       WHERE c.musteri_id = ?
       ORDER BY c.tarih, c.id`
    )
    .all(musteri.id);

  // Her satira o ana kadarki yuruyen bakiyeyi ekle
  let yuruyen = 0;
  const detay = hareketler.map((h) => {
    yuruyen = yuvarla(yuruyen + (h.tip === 'borc' ? h.tutar : -h.tutar));
    return { ...h, bakiye: yuruyen };
  });
  res.json({ musteri, bakiye: musteriBakiyesi(musteri.id), hareketler: detay.reverse() });
});

router.post('/:musteriId/tahsilat', (req, res) => {
  const musteri = db.prepare('SELECT id FROM musteriler WHERE id = ?').get(req.params.musteriId);
  if (!musteri) return res.status(404).json({ error: 'Müşteri bulunamadı' });

  const tutar = yuvarla(Number(req.body.tutar));
  if (!(tutar > 0)) return res.status(400).json({ error: 'Geçerli bir tutar girin' });
  const odemeTipi = req.body.odeme_tipi || 'nakit';
  if (!['nakit', 'kredi_karti'].includes(odemeTipi)) return res.status(400).json({ error: 'Geçersiz ödeme tipi' });

  const bakiye = musteriBakiyesi(musteri.id);
  if (tutar > bakiye + 0.001) {
    return res.status(400).json({ error: `Tahsilat borçtan fazla olamaz (borç: ${bakiye.toFixed(2)} TL)` });
  }

  const id = cariHareketEkle({
    musteri_id: musteri.id,
    sube_id: req.user.sube_id,
    tip: 'tahsilat',
    tutar,
    odeme_tipi: odemeTipi,
    aciklama: req.body.aciklama || 'Tahsilat',
    kullanici_id: req.user.id
  });
  res.status(201).json({ id, bakiye: musteriBakiyesi(musteri.id) });
});

module.exports = router;
