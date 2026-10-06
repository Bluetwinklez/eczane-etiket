// Depoya iade: miadi yaklasan partiler, geldikleri depoya (tedarikci) gore gruplanir; secilenler iade edilir,
// stoktan duser, tedarikci carisine iade olarak islenir ve yazdirilabilir iade formu olusur.
const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { partiCikis } = require('../partiler');
const { yerelSimdi } = require('../zaman');

const router = express.Router();
const yonetici = requireRole('admin', 'eczaci');
const y2 = (n) => Math.round(n * 100) / 100;
const bugun = () => yerelSimdi().toISOString().slice(0, 10);

// Partinin hangi depodan geldigi: ayni parti numarali mal kabul; yoksa urunun son mal kabulu
function partiKaynagi(p, subeId) {
  const sorgu = db.prepare(
    `SELECT mk.tedarikci_id, k.birim_maliyet, k.parti_no FROM mal_kabul_kalemleri k JOIN mal_kabulleri mk ON mk.id = k.mal_kabul_id
     WHERE k.ilac_id = ? AND mk.sube_id = ? ${p.parti_no ? 'AND k.parti_no = ?' : ''} ORDER BY mk.tarih DESC, mk.id DESC LIMIT 1`
  );
  const tam = p.parti_no ? sorgu.get(p.ilac_id, subeId, p.parti_no) : null;
  if (tam) return { ...tam, eslesme: 'parti' };
  const son = db
    .prepare(
      `SELECT mk.tedarikci_id, k.birim_maliyet FROM mal_kabul_kalemleri k JOIN mal_kabulleri mk ON mk.id = k.mal_kabul_id
       WHERE k.ilac_id = ? AND mk.sube_id = ? ORDER BY mk.tarih DESC, mk.id DESC LIMIT 1`
    )
    .get(p.ilac_id, subeId);
  return son ? { ...son, eslesme: 'son_alis' } : { tedarikci_id: null, birim_maliyet: null, eslesme: null };
}

router.get('/adaylar', (req, res) => {
  const gun = Math.min(730, Math.max(1, Number(req.query.gun) || 120));
  const sinir = new Date(Date.now() + gun * 86400000).toISOString().slice(0, 10);
  const partiler = db
    .prepare(
      `SELECT p.id AS parti_id, p.ilac_id, p.parti_no, p.skt, p.miktar, i.ad, i.barkod, i.alis_fiyati
       FROM ilac_partileri p JOIN ilaclar i ON i.id = p.ilac_id
       WHERE p.sube_id = ? AND p.miktar > 0 AND p.skt IS NOT NULL AND p.skt <= ?
       ORDER BY p.skt, i.ad`
    )
    .all(req.user.sube_id, sinir);
  const tedarikciler = new Map(db.prepare('SELECT id, firma_adi FROM tedarikciler').all().map((t) => [t.id, t.firma_adi]));
  const gruplar = new Map();
  const b = bugun();
  for (const p of partiler) {
    const k = partiKaynagi(p, req.user.sube_id);
    const anahtar = k.tedarikci_id || 0;
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, { tedarikci_id: k.tedarikci_id, tedarikci_adi: tedarikciler.get(k.tedarikci_id) || 'Depo bilinmiyor', kalemler: [], toplam: 0 });
    const g = gruplar.get(anahtar);
    const birim = y2(k.birim_maliyet ?? p.alis_fiyati ?? 0);
    const kalan = Math.round((new Date(p.skt + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
    g.kalemler.push({ ...p, birim_maliyet: birim, tutar: y2(birim * p.miktar), kalan_gun: kalan, gecti: kalan < 0, eslesme: k.eslesme });
    g.toplam = y2(g.toplam + birim * p.miktar);
  }
  res.json({ gun, gruplar: [...gruplar.values()].sort((a, b2) => (a.tedarikci_id ? 0 : 1) - (b2.tedarikci_id ? 0 : 1) || b2.toplam - a.toplam) });
});

router.get('/', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT d.*, t.firma_adi, u.ad_soyad AS kullanici_adi, (SELECT SUM(adet) FROM depo_iade_kalemleri WHERE iade_id = d.id) AS adet
         FROM depo_iadeleri d LEFT JOIN tedarikciler t ON t.id = d.tedarikci_id LEFT JOIN kullanicilar u ON u.id = d.kullanici_id
         WHERE d.sube_id = ? ORDER BY d.tarih DESC, d.id DESC LIMIT 100`
      )
      .all(req.user.sube_id)
  );
});

router.get('/:id', (req, res) => {
  const d = db
    .prepare(
      `SELECT d.*, t.firma_adi, t.telefon AS tedarikci_telefon, t.vergi_no, s.ad AS sube_adi, s.adres AS sube_adres, s.telefon AS sube_telefon, u.ad_soyad AS kullanici_adi
       FROM depo_iadeleri d LEFT JOIN tedarikciler t ON t.id = d.tedarikci_id JOIN subeler s ON s.id = d.sube_id LEFT JOIN kullanicilar u ON u.id = d.kullanici_id
       WHERE d.id = ? AND d.sube_id = ?`
    )
    .get(Number(req.params.id), req.user.sube_id);
  if (!d) return res.status(404).json({ error: 'İade bulunamadı' });
  d.kalemler = db
    .prepare('SELECT k.*, i.ad, i.barkod FROM depo_iade_kalemleri k JOIN ilaclar i ON i.id = k.ilac_id WHERE k.iade_id = ? ORDER BY i.ad')
    .all(d.id)
    .map((k) => ({ ...k, tutar: y2(k.adet * k.birim_maliyet) }));
  res.json(d);
});

router.post('/', yonetici, (req, res) => {
  const b = req.body || {};
  const tedarikciId = b.tedarikci_id ? Number(b.tedarikci_id) : null;
  if (tedarikciId && !db.prepare('SELECT id FROM tedarikciler WHERE id = ?').get(tedarikciId)) return res.status(404).json({ error: 'Depo bulunamadı' });
  const kalemler = Array.isArray(b.kalemler) ? b.kalemler : [];
  if (!kalemler.length) return res.status(400).json({ error: 'İade edilecek ürün seçin' });
  const sube = req.user.sube_id;
  const hazir = [];
  for (const k of kalemler) {
    const adet = Number(k.adet);
    const p = db.prepare('SELECT p.*, i.ad, i.alis_fiyati FROM ilac_partileri p JOIN ilaclar i ON i.id = p.ilac_id WHERE p.id = ? AND p.sube_id = ?').get(Number(k.parti_id), sube);
    if (!p) return res.status(404).json({ error: 'Parti bulunamadı' });
    if (!Number.isInteger(adet) || adet < 1 || adet > p.miktar) return res.status(400).json({ error: `${p.ad}: iade adedi 1-${p.miktar} olmalı` });
    const kaynak = partiKaynagi(p, sube);
    hazir.push({ p, adet, birim: y2(k.birim_maliyet != null ? Number(k.birim_maliyet) : kaynak.birim_maliyet ?? p.alis_fiyati ?? 0) });
  }
  const toplam = y2(hazir.reduce((t, h) => t + h.adet * h.birim, 0));
  const depoAdi = tedarikciId ? db.prepare('SELECT firma_adi FROM tedarikciler WHERE id = ?').get(tedarikciId).firma_adi : 'depo';
  db.exec('BEGIN');
  try {
    const iadeId = Number(
      db
        .prepare('INSERT INTO depo_iadeleri (sube_id, tedarikci_id, belge_no, toplam, aciklama, kullanici_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(sube, tedarikciId, b.belge_no || null, toplam, b.aciklama || null, req.user.id).lastInsertRowid
    );
    const kalem = db.prepare('INSERT INTO depo_iade_kalemleri (iade_id, ilac_id, parti_id, parti_no, skt, adet, birim_maliyet) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const h of hazir) {
      partiCikis(h.p.ilac_id, sube, h.adet, h.p.id);
      db.prepare('UPDATE ilac_stok SET stok = MAX(0, stok - ?) WHERE ilac_id = ? AND sube_id = ?').run(h.adet, h.p.ilac_id, sube);
      db.prepare("INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, 'cikis', ?, ?)").run(
        h.p.ilac_id, sube, h.adet, `Depoya iade (${depoAdi}) #${iadeId}${h.p.parti_no ? ' · parti ' + h.p.parti_no : ''}`
      );
      kalem.run(iadeId, h.p.ilac_id, h.p.id, h.p.parti_no, h.p.skt, h.adet, h.birim);
    }
    // Tedarikci carisinde alacak (iade) olarak gorunur
    if (tedarikciId && toplam > 0) {
      db.prepare(
        `INSERT INTO tedarikci_hareketleri (tedarikci_id, sube_id, tip, tutar, belge_no, belge_tarihi, odeme_sekli, aciklama, kullanici_id)
         VALUES (?, ?, 'odeme', ?, ?, ?, 'iade', ?, ?)`
      ).run(tedarikciId, sube, toplam, b.belge_no || `IADE-${iadeId}`, bugun(), `Miadı yaklaşan ürün iadesi #${iadeId}`, req.user.id);
    }
    db.exec('COMMIT');
    res.status(201).json({ id: iadeId, toplam });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'İade kaydedilemedi: ' + err.message });
  }
});

module.exports = router;
