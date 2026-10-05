const express = require('express');
const { db } = require('../db');
const { partiGiris, partiyeGeriEkle } = require('../partiler');
const { cariHareketEkle, yuvarla } = require('../cari');
const { puanHareketi } = require('../sadakat');
const { kodlariCoz, seriDurumu, gtinAnahtar, hareketYaz } = require('../its');

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

// Satis geneli yuzde indirim, kampanya sonrasi tutar uzerinden uygulandigi
// icin her kalemin net tutari bu oranla carpilir.
// Puanla odenen kisim da para olarak iade edilmez (puan geri yuklenir).
function genelIndirimCarpani(satis) {
  const kampanyaSonrasi = satis.ara_toplam - (satis.kampanya_indirimi || 0);
  const dusulen = (satis.indirim_tutari || 0) + (satis.puan_indirimi || 0);
  if (!(kampanyaSonrasi > 0) || !dusulen) return 1;
  return 1 - dusulen / kampanyaSonrasi;
}

function iadeEdilebilirKalemler(satis) {
  const carpan = genelIndirimCarpani(satis);
  return db
    .prepare(
      `SELECT sk.*, COALESCE((SELECT SUM(ik.adet) FROM iade_kalemleri ik WHERE ik.satis_kalem_id = sk.id), 0) AS iade_edilen_adet
       FROM satis_kalemleri sk WHERE sk.satis_id = ? ORDER BY sk.id`
    )
    .all(satis.id)
    .map((k) => ({
      ...k,
      iade_edilebilir_adet: k.adet - k.iade_edilen_adet,
      birim_iade_tutari: yuvarla((k.ara_toplam * carpan) / k.adet)
    }));
}

// Iade icin satis bilgisi: fis numarasiyla aranir
router.get('/satis/:satisId', (req, res) => {
  const satis = db
    .prepare(
      `SELECT sa.*, m.ad_soyad AS musteri_adi FROM satislar sa
       LEFT JOIN musteriler m ON m.id = sa.musteri_id WHERE sa.id = ?`
    )
    .get(req.params.satisId);
  if (!satis) return res.status(404).json({ error: 'Satış bulunamadı' });
  if (req.user.rol !== 'admin' && satis.sube_id !== req.user.sube_id) {
    return res.status(403).json({ error: 'Başka şubenin satışı' });
  }
  const iadeler = db.prepare('SELECT * FROM iadeler WHERE satis_id = ? ORDER BY tarih').all(satis.id);
  res.json({ ...satis, kalemler: iadeEdilebilirKalemler(satis), iadeler });
});

router.get('/', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  let sql = `
    SELECT i.*, u.ad_soyad AS kullanici_adi, m.ad_soyad AS musteri_adi,
           (SELECT GROUP_CONCAT(ik.ilac_adi || ' x' || ik.adet, ', ') FROM iade_kalemleri ik WHERE ik.iade_id = i.id) AS urunler
    FROM iadeler i
    JOIN satislar sa ON sa.id = i.satis_id
    LEFT JOIN musteriler m ON m.id = sa.musteri_id
    LEFT JOIN kullanicilar u ON u.id = i.kullanici_id
    WHERE 1=1`;
  const params = [];
  if (subeId) {
    sql += ' AND i.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY i.tarih DESC, i.id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { satis_id, kalemler, neden } = req.body;
  const stogaAl = req.body.stoga_geri_al !== false;

  const satis = db.prepare('SELECT * FROM satislar WHERE id = ?').get(satis_id);
  if (!satis) return res.status(404).json({ error: 'Satış bulunamadı' });
  if (req.user.rol !== 'admin' && satis.sube_id !== req.user.sube_id) {
    return res.status(403).json({ error: 'Başka şubenin satışı iade edilemez' });
  }
  if (!Array.isArray(kalemler) || kalemler.length === 0) {
    return res.status(400).json({ error: 'İade edilecek kalem seçin' });
  }

  const mevcutKalemler = iadeEdilebilirKalemler(satis);
  const secilen = [];
  for (const k of kalemler) {
    const adet = Number(k.adet);
    if (!Number.isInteger(adet) || adet <= 0) continue;
    const kalem = mevcutKalemler.find((m) => m.id === Number(k.satis_kalem_id));
    if (!kalem) return res.status(400).json({ error: 'Kalem bu satışa ait değil' });
    if (adet > kalem.iade_edilebilir_adet) {
      return res.status(400).json({ error: `${kalem.ilac_adi}: en fazla ${kalem.iade_edilebilir_adet} adet iade edilebilir` });
    }
    // Kalemin son kalan adetleri iade ediliyorsa yuvarlama farki kalmasin diye kalan tutar kullanilir
    const tutar =
      adet === kalem.iade_edilebilir_adet
        ? yuvarla(kalem.ara_toplam * genelIndirimCarpani(satis) - kalem.birim_iade_tutari * kalem.iade_edilen_adet)
        : yuvarla(kalem.birim_iade_tutari * adet);
    secilen.push({ kalem, adet, tutar: Math.max(0, tutar) });
  }
  if (!secilen.length) return res.status(400).json({ error: 'İade edilecek kalem seçin' });

  const toplam = yuvarla(secilen.reduce((t, s) => t + s.tutar, 0));

  // Karekodlu iade: seri bu satisla satilmis olmali; kutu stoga donerse ITS defterinde 'iade' olur
  const karekod = kodlariCoz(req.body.karekodlar);
  if (karekod.hata) return res.status(400).json({ error: karekod.hata });
  const karekodIlac = [];
  for (const k of karekod.kayitlar) {
    const satirlar = db.prepare("SELECT gtin, satis_id, ilac_id FROM karekod_hareketleri WHERE seri_no = ? AND tip = 'satis' ORDER BY id DESC").all(k.seri_no);
    const kayit = satirlar.find((r) => gtinAnahtar(r.gtin) === gtinAnahtar(k.gtin));
    if (!kayit || kayit.satis_id !== satis.id || seriDurumu(k.gtin, k.seri_no) !== 'satis') {
      return res.status(400).json({ error: `Seri ${k.seri_no} bu satışta satılmış görünmüyor` });
    }
    if (!secilen.some((s) => s.kalem.ilac_id === kayit.ilac_id)) {
      return res.status(400).json({ error: `Seri ${k.seri_no} iade edilen kalemlerle eşleşmiyor` });
    }
    karekodIlac.push(kayit.ilac_id);
  }

  db.exec('BEGIN');
  try {
    const iadeId = Number(
      db
        .prepare(
          `INSERT INTO iadeler (satis_id, sube_id, kullanici_id, toplam_tutar, odeme_tipi, stoga_alindi, neden)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(satis.id, satis.sube_id, req.user.id, toplam, satis.odeme_tipi, stogaAl ? 1 : 0, neden || null).lastInsertRowid
    );

    const insertKalem = db.prepare(
      `INSERT INTO iade_kalemleri (iade_id, satis_kalem_id, ilac_id, ilac_adi, adet, tutar, alis_fiyati)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const { kalem, adet, tutar } of secilen) {
      insertKalem.run(iadeId, kalem.id, kalem.ilac_id, kalem.ilac_adi, adet, tutar, kalem.alis_fiyati);
      if (!stogaAl) continue;

      db.prepare(
        `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
         ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = stok + excluded.stok`
      ).run(kalem.ilac_id, satis.sube_id, adet);
      db.prepare(
        `INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, 'giris', ?, ?)`
      ).run(kalem.ilac_id, satis.sube_id, adet, `İade #${iadeId} (Satış #${satis.id})`);

      // Urun satildigi partilere geri doner (son dusulen parti once)
      let kalan = adet;
      const dagilim = db
        .prepare('SELECT * FROM satis_kalemi_partileri WHERE satis_kalem_id = ? ORDER BY id DESC')
        .all(kalem.id);
      for (const d of dagilim) {
        if (kalan <= 0) break;
        const geriAlinabilir = d.adet - d.iade_edilen;
        if (geriAlinabilir <= 0 || !d.parti_id) continue;
        const miktar = Math.min(geriAlinabilir, kalan);
        if (partiyeGeriEkle(d.parti_id, miktar)) {
          db.prepare('UPDATE satis_kalemi_partileri SET iade_edilen = iade_edilen + ? WHERE id = ?').run(miktar, d.id);
          kalan -= miktar;
        }
      }
      // Parti kaydi bulunamayan kisim (eski satis veya silinmis parti) yeni bir iade partisi olur
      if (kalan > 0) partiGiris(kalem.ilac_id, satis.sube_id, kalan, { kaynak: `iade #${iadeId}` });
    }

    if (stogaAl) {
      karekod.kayitlar.forEach((k, i) =>
        hareketYaz({ subeId: satis.sube_id, tip: 'iade', k, ilacId: karekodIlac[i], satisId: satis.id, iadeId, kullaniciId: req.user.id })
      );
    }

    // Sadakat puani: kazanilan puan iade oraninda geri alinir, kullanilan puan geri yuklenir
    if (satis.musteri_id && satis.toplam_tutar > 0) {
      const oran = toplam / satis.toplam_tutar;
      puanHareketi(satis.musteri_id, -Math.round((satis.kazanilan_puan || 0) * oran), `İade #${iadeId} kazanım iptali`, satis.id, iadeId);
      puanHareketi(satis.musteri_id, Math.round((satis.kullanilan_puan || 0) * oran), `İade #${iadeId} puan iadesi`, satis.id, iadeId);
    }

    // Veresiye satisin iadesi musterinin borcundan dusulur
    if (satis.odeme_tipi === 'veresiye' && satis.musteri_id && toplam > 0) {
      cariHareketEkle({
        musteri_id: satis.musteri_id,
        sube_id: satis.sube_id,
        tip: 'iade',
        tutar: toplam,
        satis_id: satis.id,
        aciklama: `İade #${iadeId} (Satış #${satis.id})`,
        kullanici_id: req.user.id
      });
    }

    db.exec('COMMIT');
    const iade = db.prepare('SELECT * FROM iadeler WHERE id = ?').get(iadeId);
    const iadeKalemleri = db.prepare('SELECT * FROM iade_kalemleri WHERE iade_id = ?').all(iadeId);
    res.status(201).json({ ...iade, kalemler: iadeKalemleri });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'İade kaydedilemedi' });
  }
});

module.exports = router;
