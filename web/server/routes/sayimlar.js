const express = require('express');
const { db } = require('../db');
const { partiGiris, partiCikis } = require('../partiler');
const { URUN_TIPLERI } = require('../sabitler');

const router = express.Router();

function sayimGetir(id, req) {
  const sayim = db
    .prepare(
      `SELECT s.*, u.ad_soyad AS kullanici_adi, sb.ad AS sube_adi
       FROM sayimlar s
       LEFT JOIN kullanicilar u ON u.id = s.kullanici_id
       LEFT JOIN subeler sb ON sb.id = s.sube_id
       WHERE s.id = ?`
    )
    .get(id);
  if (!sayim) return null;
  if (req.user.rol !== 'admin' && sayim.sube_id !== req.user.sube_id) return null;
  return sayim;
}

// Kapsam: { kategori } veya { urun_tipi } ya da bos (tum urunler)
function kapsamdakiUrunler(sayim) {
  const kapsam = sayim.kapsam ? JSON.parse(sayim.kapsam) : {};
  let sql = `
    SELECT i.id, i.ad, i.barkod, i.kategori, i.urun_tipi, i.alis_fiyati, COALESCE(st.stok, 0) AS sistem_stok,
           k.sayilan, k.fark AS kayitli_fark, k.sistem_stok AS kapanis_stok
    FROM ilaclar i
    LEFT JOIN ilac_stok st ON st.ilac_id = i.id AND st.sube_id = ?
    LEFT JOIN sayim_kalemleri k ON k.ilac_id = i.id AND k.sayim_id = ?
    WHERE 1=1`;
  const params = [sayim.sube_id, sayim.id];
  if (kapsam.kategori) {
    sql += ' AND i.kategori = ?';
    params.push(kapsam.kategori);
  }
  if (kapsam.urun_tipi) {
    sql += ' AND i.urun_tipi = ?';
    params.push(kapsam.urun_tipi);
  }
  sql += ' ORDER BY i.ad';
  return db.prepare(sql).all(...params);
}

router.get('/', (req, res) => {
  let sql = `
    SELECT s.*, u.ad_soyad AS kullanici_adi,
           (SELECT COUNT(*) FROM sayim_kalemleri k WHERE k.sayim_id = s.id) AS sayilan_urun,
           (SELECT COUNT(*) FROM sayim_kalemleri k WHERE k.sayim_id = s.id AND k.fark != 0) AS farkli_urun,
           (SELECT COALESCE(SUM(k.fark * i.alis_fiyati), 0) FROM sayim_kalemleri k JOIN ilaclar i ON i.id = k.ilac_id
             WHERE k.sayim_id = s.id) AS fark_degeri
    FROM sayimlar s
    LEFT JOIN kullanicilar u ON u.id = s.kullanici_id
    WHERE 1=1`;
  const params = [];
  if (req.user.rol !== 'admin') {
    sql += ' AND s.sube_id = ?';
    params.push(req.user.sube_id);
  }
  sql += ' ORDER BY s.id DESC LIMIT 100';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const acik = db.prepare("SELECT id FROM sayimlar WHERE sube_id = ? AND durum = 'acik'").get(req.user.sube_id);
  if (acik) return res.status(409).json({ error: `Bu subede zaten acik bir sayim var (#${acik.id})` });

  const kapsam = {};
  if (req.body.kategori) kapsam.kategori = String(req.body.kategori);
  if (req.body.urun_tipi) {
    if (!Object.prototype.hasOwnProperty.call(URUN_TIPLERI, req.body.urun_tipi)) {
      return res.status(400).json({ error: 'Gecersiz urun tipi' });
    }
    kapsam.urun_tipi = req.body.urun_tipi;
  }
  const info = db
    .prepare('INSERT INTO sayimlar (sube_id, kullanici_id, kapsam, aciklama) VALUES (?, ?, ?, ?)')
    .run(req.user.sube_id, req.user.id, Object.keys(kapsam).length ? JSON.stringify(kapsam) : null, req.body.aciklama || null);
  res.status(201).json(db.prepare('SELECT * FROM sayimlar WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/:id', (req, res) => {
  const sayim = sayimGetir(req.params.id, req);
  if (!sayim) return res.status(404).json({ error: 'Sayim bulunamadi' });
  const urunler = kapsamdakiUrunler(sayim).map((u) => {
    // Acik sayimda fark guncel stoga gore; tamamlanmista kapanistaki kayda gore
    const fark = sayim.durum === 'tamamlandi' ? u.kayitli_fark : u.sayilan == null ? null : u.sayilan - u.sistem_stok;
    return { ...u, fark, fark_degeri: fark == null ? null : Math.round(fark * u.alis_fiyati * 100) / 100 };
  });
  const sayilanlar = urunler.filter((u) => u.sayilan != null);
  res.json({
    ...sayim,
    kapsam: sayim.kapsam ? JSON.parse(sayim.kapsam) : null,
    urunler: sayim.durum === 'tamamlandi' ? sayilanlar : urunler,
    ozet: {
      toplam_urun: urunler.length,
      sayilan_urun: sayilanlar.length,
      fazla: sayilanlar.filter((u) => u.fark > 0).length,
      eksik: sayilanlar.filter((u) => u.fark < 0).length,
      fark_degeri: Math.round(sayilanlar.reduce((t, u) => t + (u.fark_degeri || 0), 0) * 100) / 100
    }
  });
});

// Sayilan adedi yazar; arti: true ise mevcut sayima ekler (barkod okutma)
router.put('/:id/kalemler', (req, res) => {
  const sayim = sayimGetir(req.params.id, req);
  if (!sayim) return res.status(404).json({ error: 'Sayim bulunamadi' });
  if (sayim.durum !== 'acik') return res.status(400).json({ error: 'Sayim kapanmis' });

  const ilacId = Number(req.body.ilac_id);
  if (!kapsamdakiUrunler(sayim).some((u) => u.id === ilacId)) {
    return res.status(400).json({ error: 'Urun bu sayimin kapsaminda degil' });
  }
  if (req.body.sayilan === null || req.body.sayilan === '') {
    db.prepare('DELETE FROM sayim_kalemleri WHERE sayim_id = ? AND ilac_id = ?').run(sayim.id, ilacId);
    return res.json({ ilac_id: ilacId, sayilan: null });
  }
  const miktar = Number(req.body.sayilan);
  if (!Number.isInteger(miktar) || miktar < 0) return res.status(400).json({ error: 'Sayilan adet 0 veya pozitif tam sayi olmali' });

  if (req.body.arti) {
    db.prepare(
      `INSERT INTO sayim_kalemleri (sayim_id, ilac_id, sayilan) VALUES (?, ?, ?)
       ON CONFLICT(sayim_id, ilac_id) DO UPDATE SET sayilan = sayilan + excluded.sayilan`
    ).run(sayim.id, ilacId, miktar);
  } else {
    db.prepare(
      `INSERT INTO sayim_kalemleri (sayim_id, ilac_id, sayilan) VALUES (?, ?, ?)
       ON CONFLICT(sayim_id, ilac_id) DO UPDATE SET sayilan = excluded.sayilan`
    ).run(sayim.id, ilacId, miktar);
  }
  const k = db.prepare('SELECT sayilan FROM sayim_kalemleri WHERE sayim_id = ? AND ilac_id = ?').get(sayim.id, ilacId);
  res.json({ ilac_id: ilacId, sayilan: k.sayilan });
});

// Yalnizca sayilan urunler duzeltilir; fark tamamlama anindaki stoga gore hesaplanir
router.post('/:id/tamamla', (req, res) => {
  const sayim = sayimGetir(req.params.id, req);
  if (!sayim) return res.status(404).json({ error: 'Sayim bulunamadi' });
  if (sayim.durum !== 'acik') return res.status(400).json({ error: 'Sayim zaten kapanmis' });

  const kalemler = db.prepare('SELECT * FROM sayim_kalemleri WHERE sayim_id = ?').all(sayim.id);
  if (!kalemler.length) return res.status(400).json({ error: 'Hic urun sayilmamis' });

  db.exec('BEGIN');
  try {
    const stokOku = db.prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?');
    for (const k of kalemler) {
      const sistem = (stokOku.get(k.ilac_id, sayim.sube_id) || { stok: 0 }).stok;
      const fark = k.sayilan - sistem;
      db.prepare('UPDATE sayim_kalemleri SET sistem_stok = ?, fark = ? WHERE id = ?').run(sistem, fark, k.id);
      if (fark === 0) continue;
      db.prepare(
        `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
         ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = excluded.stok`
      ).run(k.ilac_id, sayim.sube_id, k.sayilan);
      if (fark > 0) partiGiris(k.ilac_id, sayim.sube_id, fark, { kaynak: `sayim #${sayim.id}` });
      else partiCikis(k.ilac_id, sayim.sube_id, -fark);
      db.prepare('INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, ?, ?, ?)').run(
        k.ilac_id,
        sayim.sube_id,
        fark > 0 ? 'giris' : 'cikis',
        Math.abs(fark),
        `Sayim #${sayim.id} duzeltmesi`
      );
    }
    db.prepare("UPDATE sayimlar SET durum = 'tamamlandi', bitis = datetime('now') WHERE id = ?").run(sayim.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Sayim tamamlanamadi' });
  }
  res.json(db.prepare('SELECT * FROM sayimlar WHERE id = ?').get(sayim.id));
});

router.post('/:id/iptal', (req, res) => {
  const sayim = sayimGetir(req.params.id, req);
  if (!sayim) return res.status(404).json({ error: 'Sayim bulunamadi' });
  if (sayim.durum !== 'acik') return res.status(400).json({ error: 'Sayim zaten kapanmis' });
  db.prepare("UPDATE sayimlar SET durum = 'iptal', bitis = datetime('now') WHERE id = ?").run(sayim.id);
  res.json(db.prepare('SELECT * FROM sayimlar WHERE id = ?').get(sayim.id));
});

module.exports = router;
