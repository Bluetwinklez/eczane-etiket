const express = require('express');
const { db } = require('../db');
const { partiCikis } = require('../partiler');
const { sepetHesapla } = require('../kampanyalar');
const { musteriBakiyesi, cariHareketEkle } = require('../cari');
const { puanUygula, puanHareketi } = require('../sadakat');
const { RECETE_TURLERI, KONTROLLU_TURLER } = require('../sabitler');
const { sqlSaatFarki, yerelSimdi } = require('../zaman');

const ODEME_TIPLERI = ['nakit', 'kredi_karti', 'sgk', 'veresiye', 'karma'];

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
    return { kod: 400, hata: 'Sepet boş olamaz' };
  }

  // Ayni urun birden fazla satirda gelirse tek satirda birlestir (stok ve kampanya dogru hesaplansin)
  const birlesik = new Map();
  for (const kalem of kalemler) {
    const adet = Number(kalem.adet);
    if (!kalem.ilac_id || !Number.isInteger(adet) || adet <= 0) {
      return { kod: 400, hata: 'Geçersiz sepet kalemi' };
    }
    const id = Number(kalem.ilac_id);
    birlesik.set(id, (birlesik.get(id) || 0) + adet);
  }

  const hazirlanmis = [];
  for (const [ilacId, adet] of birlesik) {
    const ilac = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(ilacId);
    if (!ilac) return { kod: 404, hata: `İlaç bulunamadı: ${ilacId}` };

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

// Bekletilen sepetler: subedeki tum kasalar gorur (musteri baska kasaya gecebilir)
router.get('/bekleyen', (req, res) => {
  const rows = db
    .prepare(
      `SELECT b.*, u.ad_soyad AS kullanici_adi FROM bekleyen_sepetler b
       LEFT JOIN kullanicilar u ON u.id = b.kullanici_id
       WHERE b.sube_id = ? ORDER BY b.id`
    )
    .all(req.user.sube_id);
  res.json(rows.map((r) => ({ ...r, veri: JSON.parse(r.veri) })));
});

router.post('/bekleyen', (req, res) => {
  const veri = req.body.veri;
  if (!veri || !Array.isArray(veri.sepet) || !veri.sepet.length) return res.status(400).json({ error: 'Boş sepet bekletilemez' });
  const metin = JSON.stringify(veri);
  if (metin.length > 100000) return res.status(400).json({ error: 'Sepet çok büyük' });
  const sayi = db.prepare('SELECT COUNT(*) AS c FROM bekleyen_sepetler WHERE sube_id = ?').get(req.user.sube_id).c;
  if (sayi >= 20) return res.status(400).json({ error: 'En fazla 20 sepet bekletilebilir' });
  const info = db
    .prepare('INSERT INTO bekleyen_sepetler (sube_id, kullanici_id, etiket, veri) VALUES (?, ?, ?, ?)')
    .run(req.user.sube_id, req.user.id, req.body.etiket ? String(req.body.etiket).slice(0, 60) : null, metin);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

// Geri alinan sepet silinir ve icerigi doner
router.post('/bekleyen/:id/geri-al', (req, res) => {
  const row = db.prepare('SELECT * FROM bekleyen_sepetler WHERE id = ? AND sube_id = ?').get(req.params.id, req.user.sube_id);
  if (!row) return res.status(404).json({ error: 'Bekleyen sepet bulunamadı' });
  db.prepare('DELETE FROM bekleyen_sepetler WHERE id = ?').run(row.id);
  res.json(JSON.parse(row.veri));
});

router.delete('/bekleyen/:id', (req, res) => {
  const info = db.prepare('DELETE FROM bekleyen_sepetler WHERE id = ? AND sube_id = ?').run(req.params.id, req.user.sube_id);
  if (!info.changes) return res.status(404).json({ error: 'Bekleyen sepet bulunamadı' });
  res.status(204).end();
});

// POS ekraninda sepet degistikce kampanyalarla birlikte tutarlari gosterir
router.post('/onizleme', (req, res) => {
  const { hazirlanmis, hata, kod } = sepetiHazirla(req.body.kalemler, req.user.sube_id);
  if (hata) return res.status(kod).json({ error: hata });
  const hesap = sepetHesapla(hazirlanmis, indirimYuzdesiOku(req.body.indirim_yuzdesi));
  const musteri = req.body.musteri_id ? db.prepare('SELECT * FROM musteriler WHERE id = ?').get(req.body.musteri_id) : null;
  const puan = puanUygula(hesap, { musteri, puanKullan: req.body.puan_kullan, sgk: req.body.odeme_tipi === 'sgk' || req.body.sgk_recete });
  res.json({
    ...hesap,
    ...puan,
    toplam_tutar: Math.round((hesap.toplam_tutar - puan.puan_indirimi) * 100) / 100,
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

  const odemeTipi = odeme_tipi || 'nakit';
  if (!ODEME_TIPLERI.includes(odemeTipi)) return res.status(400).json({ error: 'Geçersiz ödeme tipi' });

  let musteri = null;
  if (musteri_id) {
    musteri = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(musteri_id);
    if (!musteri) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  }
  // Recete bilgisi: kirmizi/yesil receteli ilaclar recete no, dogru recete
  // turu, doktor ve hasta TC olmadan satilamaz (kontrollu ilac defteri icin)
  const recete = {
    recete_no: req.body.recete_no ? String(req.body.recete_no).trim() : null,
    recete_turu: req.body.recete_turu || null,
    recete_tarihi: req.body.recete_tarihi || null,
    doktor_adi: req.body.doktor_adi ? String(req.body.doktor_adi).trim() : null,
    hasta_tc: req.body.hasta_tc ? String(req.body.hasta_tc).trim() : (musteri && musteri.tc_no) || null
  };
  if (recete.recete_turu && !Object.prototype.hasOwnProperty.call(RECETE_TURLERI, recete.recete_turu)) {
    return res.status(400).json({ error: 'Geçersiz reçete türü' });
  }
  if (recete.recete_tarihi && !/^\d{4}-\d{2}-\d{2}$/.test(recete.recete_tarihi)) {
    return res.status(400).json({ error: 'Reçete tarihi geçersiz' });
  }
  if (recete.hasta_tc && !/^[1-9]\d{10}$/.test(recete.hasta_tc)) return res.status(400).json({ error: 'Hasta TC kimlik no 11 haneli olmalı' });
  for (const { ilac } of hazirlanmis) {
    if (!ilac.recete_turu) continue;
    const ad = RECETE_TURLERI[ilac.recete_turu];
    if (recete.recete_turu !== ilac.recete_turu) {
      return res.status(400).json({ error: `${ilac.ad} ${ad} reçeteyle satılır; reçete türünü seçin` });
    }
    if (KONTROLLU_TURLER.includes(ilac.recete_turu) && (!recete.recete_no || !recete.doktor_adi || !recete.hasta_tc)) {
      return res.status(400).json({ error: `${ilac.ad} kontrollü ilaçtır: reçete no, doktor ve hasta TC zorunlu` });
    }
  }

  // Sadakat puani: kullanilan puan toplamdan duser, kazanilacak puan hesaplanir
  const puan = puanUygula(hesap, { musteri, puanKullan: req.body.puan_kullan, sgk: odemeTipi === 'sgk' || sgk_recete });
  if (puan.puan_hatasi) return res.status(400).json({ error: puan.puan_hatasi });
  hesap.toplam_tutar = Math.round((hesap.toplam_tutar - puan.puan_indirimi) * 100) / 100;

  // Karma odeme: nakit + kart kirilimi toplamla birebir tutmali
  let odemeler = null;
  if (odemeTipi === 'karma') {
    odemeler = (Array.isArray(req.body.odemeler) ? req.body.odemeler : [])
      .map((o) => ({ odeme_tipi: o.odeme_tipi, tutar: Math.round(Number(o.tutar) * 100) / 100 }))
      .filter((o) => o.tutar > 0);
    if (odemeler.some((o) => !['nakit', 'kredi_karti'].includes(o.odeme_tipi) || !Number.isFinite(o.tutar))) {
      return res.status(400).json({ error: 'Bölünmüş ödemede yalnızca nakit ve kart kullanılabilir' });
    }
    if (odemeler.length < 2) return res.status(400).json({ error: 'Bölünmüş ödeme en az iki parçadan oluşmalı' });
    const toplam = odemeler.reduce((t, o) => t + o.tutar, 0);
    if (Math.abs(toplam - hesap.toplam_tutar) > 0.009) {
      return res.status(400).json({ error: `Ödemelerin toplamı (${toplam.toFixed(2)}) satış tutarına (${hesap.toplam_tutar.toFixed(2)}) eşit olmalı` });
    }
  }

  if (odemeTipi === 'veresiye') {
    if (!musteri) return res.status(400).json({ error: 'Veresiye satış için müşteri seçilmelidir' });
    if (musteri.veresiye_limiti != null) {
      const yeniBakiye = musteriBakiyesi(musteri.id) + hesap.toplam_tutar;
      if (yeniBakiye > musteri.veresiye_limiti + 0.001) {
        return res.status(400).json({
          error: `Veresiye limiti aşılıyor (limit: ${musteri.veresiye_limiti.toFixed(2)} TL, mevcut borç: ${musteriBakiyesi(musteri.id).toFixed(2)} TL)`
        });
      }
    }
  }

  db.exec('BEGIN');
  try {
    const satisInfo = db
      .prepare(
        `INSERT INTO satislar (musteri_id, sube_id, kullanici_id, ara_toplam, kampanya_indirimi, indirim_tutari, toplam_tutar, odeme_tipi, sgk_recete,
                               puan_indirimi, kullanilan_puan, kazanilan_puan, recete_no, recete_turu, recete_tarihi, doktor_adi, hasta_tc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        musteri_id || null,
        subeId,
        req.user.id,
        hesap.ara_toplam,
        hesap.kampanya_indirimi,
        hesap.indirim_tutari,
        hesap.toplam_tutar,
        odemeTipi,
        sgk_recete ? 1 : 0,
        puan.puan_indirimi,
        puan.kullanilan_puan,
        puan.kazanilacak_puan,
        recete.recete_no,
        recete.recete_turu,
        recete.recete_tarihi,
        recete.doktor_adi,
        recete.hasta_tc
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
    // Kullanim talimati (istege bagli) urun bazinda: ayni urun iki satirdaysa dolu olani alinir
    const kullanimlar = new Map();
    for (const k of kalemler) {
      const metin = k.kullanim ? String(k.kullanim).trim().slice(0, 200) : '';
      if (metin) kullanimlar.set(Number(k.ilac_id), metin);
    }
    const kullanimYaz = db.prepare('UPDATE satis_kalemleri SET kullanim = ? WHERE id = ?');

    hesap.kalemler.forEach((k, idx) => {
      const { ilac, adet } = k;
      const { mevcutStok } = hazirlanmis[idx];
      const kalemInfo = insertKalem.run(
        satisId, ilac.id, ilac.ad, adet, ilac.satis_fiyati, ilac.alis_fiyati, k.net, k.kalem_indirimi, k.kampanya_id, k.kampanya_adi
      );
      if (kullanimlar.has(ilac.id)) kullanimYaz.run(kullanimlar.get(ilac.id), kalemInfo.lastInsertRowid);
      updateStok.run(mevcutStok - adet, ilac.id, subeId);
      // FEFO: SKT'si en yakin partiden dus, iade icin dagilimi sakla
      for (const d of partiCikis(ilac.id, subeId, adet)) {
        insertKalemParti.run(kalemInfo.lastInsertRowid, d.parti_id, d.adet);
      }
      insertHareket.run(ilac.id, subeId, adet, `Satış #${satisId}`);
    });

    if (musteri) {
      puanHareketi(musteri.id, -puan.kullanilan_puan, `Satış #${satisId} puan kullanımı`, satisId);
      puanHareketi(musteri.id, puan.kazanilacak_puan, `Satış #${satisId} kazanım`, satisId);
    }

    if (odemeler) {
      const odemeEkle = db.prepare('INSERT INTO satis_odemeleri (satis_id, odeme_tipi, tutar) VALUES (?, ?, ?)');
      for (const o of odemeler) odemeEkle.run(satisId, o.odeme_tipi, o.tutar);
    }

    if (odemeTipi === 'veresiye') {
      cariHareketEkle({
        musteri_id: musteri.id,
        sube_id: subeId,
        tip: 'borc',
        tutar: hesap.toplam_tutar,
        satis_id: satisId,
        aciklama: `Satış #${satisId}`,
        kullanici_id: req.user.id
      });
    }

    db.exec('COMMIT');

    const satis = db.prepare('SELECT * FROM satislar WHERE id = ?').get(satisId);
    const items = db.prepare('SELECT * FROM satis_kalemleri WHERE satis_id = ?').all(satisId);
    const dusukStokUyarisi = hazirlanmis
      .filter((k) => k.mevcutStok - k.adet <= k.ilac.kritik_stok)
      .map((k) => ({ ilac_id: k.ilac.id, ad: k.ilac.ad, kalan_stok: k.mevcutStok - k.adet }));

    const odemeDokumu = db.prepare('SELECT odeme_tipi, tutar FROM satis_odemeleri WHERE satis_id = ?').all(satisId);
    res.status(201).json({ ...satis, kalemler: items, odemeler: odemeDokumu, kritik_stok_uyarisi: dusukStokUyarisi });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Satış oluşturulamadı' });
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

// Ana sayfa paneli: son 14 gunun gunluk cirosu, son 30 / onceki 30 gun kategori dagilimi
// ve son satislar. Gunler yerel saate gore gruplanir.
router.get('/panel-ozet', (req, res) => {
  const fark = sqlSaatFarki();
  const subeId = req.user.sube_id;
  const yerelGun = (gunOnce) => {
    const d = yerelSimdi();
    d.setUTCDate(d.getUTCDate() - gunOnce);
    return d.toISOString().slice(0, 10);
  };

  const gunlukSatirlar = db
    .prepare(
      `SELECT date(tarih, ?) AS gun, SUM(toplam_tutar) AS toplam, COUNT(*) AS adet
       FROM satislar WHERE sube_id = ? AND date(tarih, ?) >= ? GROUP BY gun`
    )
    .all(fark, subeId, fark, yerelGun(13));
  const gunHaritasi = Object.fromEntries(gunlukSatirlar.map((r) => [r.gun, r]));
  const gunluk = [];
  for (let i = 13; i >= 0; i--) {
    const gun = yerelGun(i);
    const r = gunHaritasi[gun];
    gunluk.push({ gun, toplam: r ? Math.round(r.toplam * 100) / 100 : 0, adet: r ? r.adet : 0 });
  }

  // Kategori karsilastirmasi: son 30 gun / onceki 30 gun (yarim ay ile tam ayi kiyaslamamak icin)
  const kategoriSatirlari = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(i.kategori), ''), 'Diğer') AS kategori,
              SUM(CASE WHEN date(sa.tarih, ?) >= ? THEN sk.ara_toplam ELSE 0 END) AS son_30,
              SUM(CASE WHEN date(sa.tarih, ?) < ? THEN sk.ara_toplam ELSE 0 END) AS onceki_30
       FROM satis_kalemleri sk
       JOIN satislar sa ON sa.id = sk.satis_id
       JOIN ilaclar i ON i.id = sk.ilac_id
       WHERE sa.sube_id = ? AND date(sa.tarih, ?) >= ?
       GROUP BY 1 ORDER BY son_30 DESC, onceki_30 DESC`
    )
    .all(fark, yerelGun(29), fark, yerelGun(29), subeId, fark, yerelGun(59));
  // Radar okunakli kalsin diye en fazla 6 eksen: ilk 5 kategori + "Diğer"
  let kategoriler = kategoriSatirlari;
  if (kategoriSatirlari.length > 6) {
    const kalan = kategoriSatirlari.slice(5);
    kategoriler = kategoriSatirlari.slice(0, 5).concat({
      kategori: 'Diğer',
      son_30: kalan.reduce((t, r) => t + r.son_30, 0),
      onceki_30: kalan.reduce((t, r) => t + r.onceki_30, 0)
    });
  }
  kategoriler = kategoriler.map((k) => ({
    kategori: k.kategori,
    son_30: Math.round(k.son_30 * 100) / 100,
    onceki_30: Math.round(k.onceki_30 * 100) / 100
  }));

  const sonSatislar = db
    .prepare(
      `SELECT sa.id, sa.tarih, sa.toplam_tutar, sa.odeme_tipi, m.ad_soyad AS musteri_adi,
              (SELECT COUNT(*) FROM satis_kalemleri WHERE satis_id = sa.id) AS kalem_sayisi,
              (SELECT ilac_adi FROM satis_kalemleri WHERE satis_id = sa.id ORDER BY id LIMIT 1) AS ilk_urun
       FROM satislar sa LEFT JOIN musteriler m ON m.id = sa.musteri_id
       WHERE sa.sube_id = ? ORDER BY sa.tarih DESC, sa.id DESC LIMIT 6`
    )
    .all(subeId);

  res.json({ gunluk, kategoriler, son_satislar: sonSatislar });
});

router.get('/:id', (req, res) => {
  const satis = db.prepare('SELECT * FROM satislar WHERE id = ?').get(req.params.id);
  if (!satis) return res.status(404).json({ error: 'Satış bulunamadı' });
  const kalemler = db.prepare('SELECT * FROM satis_kalemleri WHERE satis_id = ?').all(req.params.id);
  res.json({ ...satis, kalemler });
});

module.exports = router;
