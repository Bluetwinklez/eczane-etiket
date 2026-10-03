const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

function ilacWithStok(subeId) {
  if (subeId) {
    return db
      .prepare(
        `SELECT i.*, COALESCE(s.stok, 0) AS stok
         FROM ilaclar i
         LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
         ORDER BY i.ad`
      )
      .all(subeId);
  }
  return db
    .prepare(
      `SELECT i.*, COALESCE(SUM(s.stok), 0) AS stok
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id
       GROUP BY i.id
       ORDER BY i.ad`
    )
    .all();
}

router.get('/', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  let rows = ilacWithStok(subeId);

  const { q } = req.query;
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.ad.toLowerCase().includes(needle) ||
        (r.barkod || '').includes(q) ||
        (r.kategori || '').toLowerCase().includes(needle)
    );
  }
  res.json(rows);
});

router.get('/uyarilar', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const rows = ilacWithStok(subeId);

  const bugun = new Date();
  const otuzGunSonra = new Date(bugun.getTime() + 30 * 24 * 60 * 60 * 1000);

  const kritikStok = rows.filter((r) => r.stok <= r.kritik_stok);
  const sktYaklasan = rows
    .filter((r) => r.skt && new Date(r.skt) <= otuzGunSonra)
    .map((r) => ({ ...r, durum: new Date(r.skt) < bugun ? 'sona_ermis' : 'yaklasiyor' }));

  res.json({ kritik_stok: kritikStok, skt_yaklasan: sktYaklasan });
});

router.get('/:id', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const rows = ilacWithStok(subeId);
  const row = rows.find((r) => r.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Ilac bulunamadi' });
  res.json(row);
});

router.get('/:id/fiyat-gecmisi', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM fiyat_gecmisi WHERE ilac_id = ? ORDER BY tarih DESC')
    .all(req.params.id);
  res.json(rows);
});

router.post('/', requireRole('admin', 'eczaci'), (req, res) => {
  const { ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt, stok } = req.body;
  if (!ad || !ad.trim()) return res.status(400).json({ error: 'Ilac adi zorunludur' });
  if (satis_fiyati == null || Number(satis_fiyati) < 0) {
    return res.status(400).json({ error: 'Gecerli bir satis fiyati girin' });
  }

  try {
    const info = db
      .prepare(
        `INSERT INTO ilaclar (ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ad.trim(),
        barkod || null,
        kategori || null,
        uretici || null,
        receteli ? 1 : 0,
        Number(kritik_stok) || 10,
        Number(alis_fiyati) || 0,
        Number(satis_fiyati),
        skt || null
      );

    const subeler = db.prepare('SELECT id FROM subeler').all();
    const baslangicStok = Number(stok) || 0;
    const insertStok = db.prepare('INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)');
    for (const sube of subeler) {
      insertStok.run(info.lastInsertRowid, sube.id, sube.id === req.user.sube_id ? baslangicStok : 0);
    }

    const created = ilacWithStok(req.user.sube_id).find((r) => r.id === Number(info.lastInsertRowid));
    res.status(201).json(created);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu barkod zaten kayitli' });
    }
    res.status(500).json({ error: 'Ilac eklenemedi' });
  }
});

router.put('/:id', requireRole('admin', 'eczaci'), (req, res) => {
  const existing = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ilac bulunamadi' });

  const { ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt } = req.body;
  if (!ad || !ad.trim()) return res.status(400).json({ error: 'Ilac adi zorunludur' });

  try {
    const yeniSatisFiyati = Number(satis_fiyati) || 0;
    if (yeniSatisFiyati !== existing.satis_fiyati) {
      db.prepare('INSERT INTO fiyat_gecmisi (ilac_id, eski_fiyat, yeni_fiyat) VALUES (?, ?, ?)').run(
        req.params.id,
        existing.satis_fiyati,
        yeniSatisFiyati
      );
    }

    db.prepare(
      `UPDATE ilaclar SET ad=?, barkod=?, kategori=?, uretici=?, receteli=?, kritik_stok=?, alis_fiyati=?, satis_fiyati=?, skt=?
       WHERE id=?`
    ).run(
      ad.trim(),
      barkod || null,
      kategori || null,
      uretici || null,
      receteli ? 1 : 0,
      Number(kritik_stok) || 10,
      Number(alis_fiyati) || 0,
      yeniSatisFiyati,
      skt || null,
      req.params.id
    );

    const updated = ilacWithStok(req.user.sube_id).find((r) => r.id === Number(req.params.id));
    res.json(updated);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu barkod zaten kayitli' });
    }
    res.status(500).json({ error: 'Ilac guncellenemedi' });
  }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ilac bulunamadi' });
  db.prepare('DELETE FROM ilaclar WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.post('/:id/stok', requireRole('admin', 'eczaci'), (req, res) => {
  const ilac = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!ilac) return res.status(404).json({ error: 'Ilac bulunamadi' });

  const subeId = req.user.rol === 'admin' && req.body.sube_id ? Number(req.body.sube_id) : req.user.sube_id;
  const { tip, adet, aciklama } = req.body;
  const miktar = Number(adet);
  if (!['giris', 'cikis'].includes(tip) || !Number.isFinite(miktar) || miktar <= 0) {
    return res.status(400).json({ error: 'Gecersiz stok hareketi' });
  }

  const mevcut = db
    .prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?')
    .get(req.params.id, subeId);
  const mevcutStok = mevcut ? mevcut.stok : 0;
  const yeniStok = tip === 'giris' ? mevcutStok + miktar : mevcutStok - miktar;
  if (yeniStok < 0) {
    return res.status(400).json({ error: 'Stok yetersiz' });
  }

  db.prepare(
    `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
     ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = excluded.stok`
  ).run(req.params.id, subeId, yeniStok);

  db.prepare(
    'INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, subeId, tip, miktar, aciklama || null);

  const updated = ilacWithStok(subeId).find((r) => r.id === Number(req.params.id));
  res.json(updated);
});

router.get('/:id/hareketler', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const rows = subeId
    ? db
        .prepare('SELECT * FROM stok_hareketleri WHERE ilac_id = ? AND sube_id = ? ORDER BY tarih DESC')
        .all(req.params.id, subeId)
    : db.prepare('SELECT * FROM stok_hareketleri WHERE ilac_id = ? ORDER BY tarih DESC').all(req.params.id);
  res.json(rows);
});

module.exports = router;
