// TITCK resmi ilac listesi: yukleme / indirme, barkodla arama, listeden urun ekleme, pasif urun uyarisi.
const express = require('express');
const { db, ayarOku, ayarYaz } = require('../db');
const { requireRole } = require('../auth');
const { listeyiCoz, sonListeyiIndir, atcAnaGrup } = require('../titck');
const { kucuk } = require('../ilacBilgi');
const { yerelSimdi } = require('../zaman');

const router = express.Router();
const yonetici = requireRole('admin', 'eczaci');

function durumBilgisi() {
  const sayim = db.prepare('SELECT durum, COUNT(*) AS adet FROM titck_ilaclar GROUP BY durum').all();
  const toplam = sayim.reduce((t, s) => t + s.adet, 0);
  return {
    yuklu: toplam > 0,
    toplam,
    aktif: (sayim.find((s) => s.durum === 'aktif') || {}).adet || 0,
    pasif: (sayim.find((s) => s.durum === 'pasif') || {}).adet || 0,
    liste_tarihi: ayarOku('titck_liste_tarihi'),
    yuklenme: ayarOku('titck_yuklenme')
  };
}

// Katalogdaki urunlerin bos ATC kodunu TITCK listesinden doldurur
function atcDoldur() {
  db.prepare(
    `INSERT OR IGNORE INTO ilac_bilgi (ilac_id) SELECT i.id FROM ilaclar i JOIN titck_ilaclar t ON t.barkod = i.barkod`
  ).run();
  return Number(
    db
      .prepare(
        `UPDATE ilac_bilgi SET atc_kodu = (SELECT t.atc_kodu FROM titck_ilaclar t JOIN ilaclar i ON i.barkod = t.barkod WHERE i.id = ilac_bilgi.ilac_id),
                               guncelleme = datetime('now')
         WHERE (atc_kodu IS NULL OR atc_kodu = '')
           AND EXISTS (SELECT 1 FROM titck_ilaclar t JOIN ilaclar i ON i.barkod = t.barkod WHERE i.id = ilac_bilgi.ilac_id AND t.atc_kodu IS NOT NULL)`
      )
      .run().changes
  );
}

function listeyiKaydet(tampon) {
  const cozum = listeyiCoz(tampon);
  if (cozum.hata) return { hata: cozum.hata };
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM titck_ilaclar');
    const ekle = db.prepare('INSERT INTO titck_ilaclar (barkod, ad, atc_kodu, atc_adi, firma, recete_turu, durum, temel_ilac) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const k of cozum.kayitlar) ekle.run(k.barkod, k.ad, k.atc_kodu, k.atc_adi, k.firma, k.recete_turu, k.durum, k.temel_ilac);
    ayarYaz('titck_liste_tarihi', cozum.liste_tarihi || '');
    ayarYaz('titck_yuklenme', yerelSimdi().toISOString().slice(0, 16).replace('T', ' '));
    const atc = atcDoldur();
    db.exec('COMMIT');
    return { ...durumBilgisi(), atc_doldurulan: atc };
  } catch (err) {
    db.exec('ROLLBACK');
    return { hata: 'Liste kaydedilemedi: ' + err.message };
  }
}

router.get('/durum', (req, res) => res.json(durumBilgisi()));

// Ham .xlsx dosyasi (Content-Type: application/octet-stream)
router.post('/yukle', yonetici, express.raw({ type: 'application/octet-stream', limit: '40mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Dosya gönderilmedi' });
  const sonuc = listeyiKaydet(req.body);
  if (sonuc.hata) return res.status(400).json({ error: sonuc.hata });
  res.json(sonuc);
});

router.post('/indir', yonetici, async (req, res) => {
  let tampon;
  try {
    tampon = await sonListeyiIndir();
  } catch (err) {
    return res.status(502).json({ error: 'TİTCK listesi indirilemedi (internet bağlantısını kontrol edin): ' + err.message });
  }
  const sonuc = listeyiKaydet(tampon);
  if (sonuc.hata) return res.status(400).json({ error: sonuc.hata });
  res.json(sonuc);
});

const SATIR = `t.barkod, t.ad, t.atc_kodu, t.atc_adi, t.firma, t.recete_turu, t.durum, t.temel_ilac,
               (SELECT i.id FROM ilaclar i WHERE i.barkod = t.barkod) AS ilac_id`;

router.get('/ara', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'En az 2 karakter yazın' });
  const sadeceAktif = req.query.aktif === '1' ? "AND t.durum = 'aktif'" : '';
  let satirlar;
  if (/^\d{6,14}$/.test(q)) {
    satirlar = db.prepare(`SELECT ${SATIR} FROM titck_ilaclar t WHERE t.barkod LIKE ? ${sadeceAktif} ORDER BY t.ad LIMIT 40`).all(q + '%');
  } else if (/^[A-Za-z]\d{2}[A-Za-z0-9]{0,4}$/.test(q)) {
    satirlar = db.prepare(`SELECT ${SATIR} FROM titck_ilaclar t WHERE t.atc_kodu LIKE ? ${sadeceAktif} ORDER BY t.ad LIMIT 40`).all(q.toUpperCase() + '%');
  } else {
    // SQLite buyuk/kucuk harf duyarsizligi Turkce harflerde guvenilmez; JS tarafinda suzulur
    const hedef = kucuk(q);
    satirlar = db
      .prepare(`SELECT ${SATIR} FROM titck_ilaclar t WHERE 1=1 ${sadeceAktif}`)
      .all()
      .filter((r) => kucuk(r.ad).includes(hedef) || kucuk(r.atc_adi).includes(hedef) || kucuk(r.firma).includes(hedef))
      .slice(0, 40);
  }
  res.json(satirlar.map((r) => ({ ...r, atc_grubu: atcAnaGrup(r.atc_kodu), katalogda: Boolean(r.ilac_id) })));
});

router.get('/barkod/:barkod', (req, res) => {
  const r = db.prepare(`SELECT ${SATIR} FROM titck_ilaclar t WHERE t.barkod = ?`).get(String(req.params.barkod).replace(/\D/g, ''));
  if (!r) return res.status(404).json({ error: 'Bu barkod TİTCK listesinde yok' });
  res.json({ ...r, atc_grubu: atcAnaGrup(r.atc_kodu), katalogda: Boolean(r.ilac_id) });
});

// TITCK kaydindan katalog urunu olusturur (ad, firma, ATC, recete turu, kategori dolar)
router.post('/urune-ekle', yonetici, (req, res) => {
  const barkod = String(req.body.barkod || '').replace(/\D/g, '');
  const t = db.prepare('SELECT * FROM titck_ilaclar WHERE barkod = ?').get(barkod);
  if (!t) return res.status(404).json({ error: 'Bu barkod TİTCK listesinde yok' });
  if (db.prepare('SELECT id FROM ilaclar WHERE barkod = ?').get(barkod)) return res.status(409).json({ error: 'Bu barkod zaten kayıtlı' });
  const fiyat = Number(req.body.satis_fiyati);
  if (!(fiyat >= 0)) return res.status(400).json({ error: 'Satış fiyatını girin' });

  db.exec('BEGIN');
  try {
    const id = Number(
      db
        .prepare(
          `INSERT INTO ilaclar (ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, urun_tipi, recete_turu)
           VALUES (?, ?, ?, ?, 1, 10, ?, ?, 'ilac', ?)`
        )
        .run(t.ad, t.barkod, atcAnaGrup(t.atc_kodu), t.firma, Number(req.body.alis_fiyati) || 0, fiyat, t.recete_turu).lastInsertRowid
    );
    const stokEkle = db.prepare('INSERT OR IGNORE INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, 0)');
    for (const s of db.prepare('SELECT id FROM subeler').all()) stokEkle.run(id, s.id);
    db.prepare('INSERT INTO ilac_bilgi (ilac_id, atc_kodu) VALUES (?, ?)').run(id, t.atc_kodu);
    db.exec('COMMIT');
    res.status(201).json({ id, ad: t.ad });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Ürün eklenemedi' });
  }
});

// Stokta duran ama TITCK'da pasif / pasife alinacak gorunen urunler
router.get('/pasif-stok', (req, res) => {
  const satirlar = db
    .prepare(
      `SELECT i.id, i.ad, i.barkod, COALESCE(s.stok, 0) AS stok, t.durum
       FROM ilaclar i JOIN titck_ilaclar t ON t.barkod = i.barkod
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       WHERE t.durum != 'aktif' AND COALESCE(s.stok, 0) > 0
       ORDER BY s.stok DESC`
    )
    .all(req.user.sube_id);
  res.json(satirlar);
});

module.exports = router;
module.exports.atcDoldur = atcDoldur;
