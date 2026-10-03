const express = require('express');
const { db } = require('../db');
const { partiCikis } = require('../partiler');
const { sepetHesapla } = require('../kampanyalar');

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

// Sepeti dogrular ve stoklari kontrol eder; hata varsa { hata, kod } doner.
function sepetiHazirla(kalemler, subeId) {
  if (!Array.isArray(kalemler) || kalemler.length === 0) {
    return { kod: 400, hata: 'Sepet bos olamaz' };
  }

  // Ayni urun birden fazla satirda gelirse tek satirda birlestir (stok ve kampanya dogru hesaplansin)
  const birlesik = new Map();
  for (const kalem of kalemler) {
    const adet = Number(kalem.adet);
    if (!kalem.ilac_id || !Number.isInteger(adet) || adet <= 0) {
      return { kod: 400, hata: 'Gecersiz sepet kalemi' };
    }
    const id = Number(kalem.ilac_id);
    birlesik.set(id, (birlesik.get(id) || 0) + adet);
  }

  const hazirlanmis = [];
  for (const [ilacId, adet] of birlesik) {
    const ilac = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(ilacId);
    if (!ilac) return { kod: 404, hata: `Ilac bulunamadi: ${ilacId}` };

    const stokRow = db.prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?').get(ilacId, subeId);
    const mevcutStok = stokRow ? stokRow.stok : 0;
    if (mevcutStok < adet) {
      return { kod: 400, hata: `Yetersiz stok: ${ilac.ad} (mevcut: ${mevcutStok})` };
    }
    hazirlanmis.push({ ilac, adet, mevcutStok });
  }
  return { hazirlanmis };
}

function indirimYuzdesiOku(deger) {
  return Math.min(100, Math.max(0, Number(deger) || 0));
}

// POS ekraninda sepet degistikce kampanyalarla birlikte tutarlari gosterir
router.post('/onizleme', (req, res) => {
  const { hazirlanmis, hata, kod } = sepetiHazirla(req.body.kalemler, req.user.sube_id);
  if (hata) return res.status(kod).json({ error: hata });
  const hesap = sepetHesapla(hazirlanmis, indirimYuzdesiOku(req.body.indirim_yuzdesi));
  res.json({
    ...hesap,
    kalemler: hesap.kalemler.map((k) => ({
      ilac_id: k.ilac.id,
      ilac_adi: k.ilac.ad,
      adet: k.adet,
      birim_fiyat: k.ilac.satis_fiyati,
      brut: k.brut,
      kalem_indirimi: k.kalem_indirimi,
      net: k.net,
      kampanya_id: k.kampanya_id,
      kampanya_adi: k.kampanya_adi
    }))
  });
});

router.post('/', (req, res) => {
  const { musteri_id, odeme_tipi, sgk_recete, kalemler, indirim_yuzdesi } = req.body;
  const subeId = req.user.sube_id;

  const { hazirlanmis, hata, kod } = sepetiHazirla(kalemler, subeId);
  if (hata) return res.status(kod).json({ error: hata });

  const hesap = sepetHesapla(hazirlanmis, indirimYuzdesiOku(indirim_yuzdesi));

  db.exec('BEGIN');
  try {
    const satisInfo = db
      .prepare(
        `INSERT INTO satislar (musteri_id, sube_id, kullanici_id, ara_toplam, kampanya_indirimi, indirim_tutari, toplam_tutar, odeme_tipi, sgk_recete)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        musteri_id || null,
        subeId,
        req.user.id,
        hesap.ara_toplam,
        hesap.kampanya_indirimi,
        hesap.indirim_tutari,
        hesap.toplam_tutar,
        odeme_tipi || 'nakit',
        sgk_recete ? 1 : 0
      );

    const satisId = satisInfo.lastInsertRowid;
    const insertKalem = db.prepare(
      `INSERT INTO satis_kalemleri (satis_id, ilac_id, ilac_adi, adet, birim_fiyat, alis_fiyati, ara_toplam, kalem_indirimi, kampanya_id, kampanya_adi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const updateStok = db.prepare('UPDATE ilac_stok SET stok = ? WHERE ilac_id = ? AND sube_id = ?');
    const insertHareket = db.prepare(
      `INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, 'cikis', ?, ?)`
    );

    const insertKalemParti = db.prepare(
      'INSERT INTO satis_kalemi_partileri (satis_kalem_id, parti_id, adet) VALUES (?, ?, ?)'
    );

    // Kalem ara_toplam'i kampanya indirimi dusulmus net tutardir (raporlardaki ciro buna dayanir)
    hesap.kalemler.forEach((k, idx) => {
      const { ilac, adet } = k;
      const { mevcutStok } = hazirlanmis[idx];
      const kalemInfo = insertKalem.run(
        satisId, ilac.id, ilac.ad, adet, ilac.satis_fiyati, ilac.alis_fiyati, k.net, k.kalem_indirimi, k.kampanya_id, k.kampanya_adi
      );
      updateStok.run(mevcutStok - adet, ilac.id, subeId);
      // FEFO: SKT'si en yakin partiden dus, iade icin dagilimi sakla
      for (const d of partiCikis(ilac.id, subeId, adet)) {
        insertKalemParti.run(kalemInfo.lastInsertRowid, d.parti_id, d.adet);
      }
      insertHareket.run(ilac.id, subeId, adet, `Satis #${satisId}`);
    });

    db.exec('COMMIT');

    const satis = db.prepare('SELECT * FROM satislar WHERE id = ?').get(satisId);
    const items = db.prepare('SELECT * FROM satis_kalemleri WHERE satis_id = ?').all(satisId);
    const dusukStokUyarisi = hazirlanmis
      .filter((k) => k.mevcutStok - k.adet <= k.ilac.kritik_stok)
      .map((k) => ({ ilac_id: k.ilac.id, ad: k.ilac.ad, kalan_stok: k.mevcutStok - k.adet }));

    res.status(201).json({ ...satis, kalemler: items, kritik_stok_uyarisi: dusukStokUyarisi });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Satis olusturulamadi' });
  }
});

router.get('/', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { baslangic, bitis, musteri_id } = req.query;

  let sql = `
    SELECT sa.*, m.ad_soyad AS musteri_adi, k.ad_soyad AS satan_kullanici, s.ad AS sube_adi
    FROM satislar sa
    LEFT JOIN musteriler m ON m.id = sa.musteri_id
    LEFT JOIN kullanicilar k ON k.id = sa.kullanici_id
    LEFT JOIN subeler s ON s.id = sa.sube_id
    WHERE 1=1
  `;
  const params = [];
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  if (baslangic) {
    sql += ' AND sa.tarih >= ?';
    params.push(baslangic);
  }
  if (bitis) {
    sql += ' AND sa.tarih <= ?';
    params.push(bitis);
  }
  if (musteri_id) {
    sql += ' AND sa.musteri_id = ?';
    params.push(Number(musteri_id));
  }
  sql += ' ORDER BY sa.tarih DESC LIMIT 500';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const satis = db.prepare('SELECT * FROM satislar WHERE id = ?').get(req.params.id);
  if (!satis) return res.status(404).json({ error: 'Satis bulunamadi' });
  const kalemler = db.prepare('SELECT * FROM satis_kalemleri WHERE satis_id = ?').all(req.params.id);
  res.json({ ...satis, kalemler });
});

module.exports = router;
