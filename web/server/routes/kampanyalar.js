const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { URUN_TIPLERI } = require('../sabitler');
const { aktifKampanyalar } = require('../kampanyalar');

const router = express.Router();

const TARIH_DESENI = /^\d{4}-\d{2}-\d{2}$/;

function durumHesapla(k, bugun) {
  if (!k.aktif) return 'pasif';
  if (k.baslangic && k.baslangic > bugun) return 'planlandi';
  if (k.bitis && k.bitis < bugun) return 'sona_erdi';
  return 'aktif';
}

function hedefAdi(k) {
  if (k.hedef_tip === 'tumu') return 'Tüm reçetesiz ürünler';
  if (k.hedef_tip === 'urun_tipi') return URUN_TIPLERI[k.hedef_deger] || k.hedef_deger;
  if (k.hedef_tip === 'kategori') return `Kategori: ${k.hedef_deger}`;
  return k.hedef_urun_adi || `Ürün #${k.hedef_deger}`;
}

function zenginlestir(rows) {
  const bugun = new Date().toISOString().slice(0, 10);
  return rows.map((k) => ({ ...k, durum: durumHesapla(k, bugun), hedef_adi: hedefAdi(k) }));
}

const LISTE_SQL = `
  SELECT k.*, i.ad AS hedef_urun_adi,
         (SELECT COUNT(*) FROM satis_kalemleri sk WHERE sk.kampanya_id = k.id) AS kullanim_sayisi,
         (SELECT COALESCE(SUM(sk.kalem_indirimi), 0) FROM satis_kalemleri sk WHERE sk.kampanya_id = k.id) AS toplam_indirim
  FROM kampanyalar k
  LEFT JOIN ilaclar i ON k.hedef_tip = 'urun' AND i.id = CAST(k.hedef_deger AS INTEGER)`;

function dogrula(body) {
  const { ad, tip, hedef_tip, hedef_deger, indirim_yuzdesi, al_adet, ode_adet, baslangic, bitis } = body;
  if (!ad || !String(ad).trim()) return 'Kampanya adi zorunludur';
  if (!['yuzde', 'x_al_y_ode'].includes(tip)) return 'Gecersiz kampanya tipi';
  if (!['tumu', 'urun', 'kategori', 'urun_tipi'].includes(hedef_tip)) return 'Gecersiz hedef tipi';
  if (hedef_tip === 'urun') {
    const ilac = db.prepare('SELECT id, receteli FROM ilaclar WHERE id = ?').get(Number(hedef_deger));
    if (!ilac) return 'Hedef urun bulunamadi';
    if (ilac.receteli) return 'Receteli ilaclara kampanya uygulanamaz';
  }
  if (hedef_tip === 'kategori' && !String(hedef_deger || '').trim()) return 'Kategori adi zorunludur';
  if (hedef_tip === 'urun_tipi' && !Object.prototype.hasOwnProperty.call(URUN_TIPLERI, hedef_deger)) {
    return 'Gecersiz urun tipi';
  }
  if (tip === 'yuzde') {
    const y = Number(indirim_yuzdesi);
    if (!(y > 0 && y <= 90)) return 'Indirim yuzdesi 0-90 arasinda olmali';
  } else {
    const al = Number(al_adet);
    const ode = Number(ode_adet);
    if (!Number.isInteger(al) || !Number.isInteger(ode) || ode < 1 || al <= ode || al > 20) {
      return '"X al Y ode" icin X > Y >= 1 olmali (orn. 3 al 2 ode)';
    }
  }
  if (baslangic && !TARIH_DESENI.test(baslangic)) return 'Baslangic tarihi gecersiz';
  if (bitis && !TARIH_DESENI.test(bitis)) return 'Bitis tarihi gecersiz';
  if (baslangic && bitis && bitis < baslangic) return 'Bitis tarihi baslangictan once olamaz';
  return null;
}

function kayitDegerleri(body) {
  const yuzdeMi = body.tip === 'yuzde';
  return [
    String(body.ad).trim(),
    body.tip,
    body.hedef_tip,
    body.hedef_tip === 'tumu' ? null : String(body.hedef_deger).trim(),
    yuzdeMi ? Number(body.indirim_yuzdesi) : null,
    yuzdeMi ? null : Number(body.al_adet),
    yuzdeMi ? null : Number(body.ode_adet),
    body.baslangic || null,
    body.bitis || null,
    body.aktif === false || body.aktif === 0 ? 0 : 1
  ];
}

router.get('/', (req, res) => {
  res.json(zenginlestir(db.prepare(`${LISTE_SQL} ORDER BY k.aktif DESC, k.id DESC`).all()));
});

// POS ve kasiyerler icin bugun gecerli kampanyalar
router.get('/aktif', (req, res) => {
  const ids = aktifKampanyalar().map((k) => k.id);
  if (!ids.length) return res.json([]);
  const rows = db.prepare(`${LISTE_SQL} WHERE k.id IN (${ids.map(() => '?').join(',')}) ORDER BY k.ad`).all(...ids);
  res.json(zenginlestir(rows));
});

router.post('/', requireRole('admin', 'eczaci'), (req, res) => {
  const hata = dogrula(req.body);
  if (hata) return res.status(400).json({ error: hata });
  const info = db
    .prepare(
      `INSERT INTO kampanyalar (ad, tip, hedef_tip, hedef_deger, indirim_yuzdesi, al_adet, ode_adet, baslangic, bitis, aktif)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(...kayitDegerleri(req.body));
  const kayit = db.prepare(`${LISTE_SQL} WHERE k.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(zenginlestir([kayit])[0]);
});

router.put('/:id', requireRole('admin', 'eczaci'), (req, res) => {
  const mevcut = db.prepare('SELECT id FROM kampanyalar WHERE id = ?').get(req.params.id);
  if (!mevcut) return res.status(404).json({ error: 'Kampanya bulunamadı' });
  const hata = dogrula(req.body);
  if (hata) return res.status(400).json({ error: hata });
  db.prepare(
    `UPDATE kampanyalar SET ad=?, tip=?, hedef_tip=?, hedef_deger=?, indirim_yuzdesi=?, al_adet=?, ode_adet=?,
       baslangic=?, bitis=?, aktif=? WHERE id=?`
  ).run(...kayitDegerleri(req.body), req.params.id);
  const kayit = db.prepare(`${LISTE_SQL} WHERE k.id = ?`).get(req.params.id);
  res.json(zenginlestir([kayit])[0]);
});

router.delete('/:id', requireRole('admin', 'eczaci'), (req, res) => {
  const info = db.prepare('DELETE FROM kampanyalar WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Kampanya bulunamadı' });
  res.status(204).end();
});

module.exports = router;
