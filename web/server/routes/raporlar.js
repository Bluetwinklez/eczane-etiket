const express = require('express');
const { db } = require('../db');
const { sendCsv, sendPdf } = require('../export');
const { URUN_TIPLERI, RECETE_TURLERI, KONTROLLU_TURLER } = require('../sabitler');
const { sqlSaatFarki } = require('../zaman');

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

function tarihFiltresi(baslangic, bitis) {
  const kosullar = [];
  const params = [];
  if (baslangic) {
    kosullar.push('sa.tarih >= ?');
    params.push(baslangic);
  }
  if (bitis) {
    kosullar.push('sa.tarih <= ?');
    params.push(bitis);
  }
  return { kosul: kosullar.length ? ' AND ' + kosullar.join(' AND ') : '', params };
}

function cikisYap(req, res, filename, title, rows, columns) {
  const format = req.query.format || 'json';
  if (format === 'csv') return sendCsv(res, filename + '.csv', rows, columns);
  if (format === 'pdf') return sendPdf(res, filename + '.pdf', title, rows, columns);
  return res.json(rows);
}

// 11. Gun/hafta/ay satis raporu
router.get('/satis', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const periyot = req.query.periyot || 'gunluk';
  const grup = periyot === 'aylik' ? '%Y-%m' : periyot === 'haftalik' ? '%Y-W%W' : '%Y-%m-%d';
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);

  let sql = `
    SELECT strftime('${grup}', sa.tarih) AS donem, COUNT(*) AS satis_adedi, SUM(sa.toplam_tutar) AS toplam_ciro
    FROM satislar sa
    WHERE 1=1 ${kosul}
  `;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY donem ORDER BY donem DESC';

  const rows = db.prepare(sql).all(...params);
  cikisYap(req, res, 'satis-raporu', 'Satış Raporu', rows, [
    { alan: 'donem', baslik: 'Dönem' },
    { alan: 'satis_adedi', baslik: 'Satış Adedi' },
    { alan: 'toplam_ciro', baslik: 'Toplam Ciro (TL)' }
  ]);
});

// 12. En cok satan ilaclar
router.get('/en-cok-satan', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const limit = Number(req.query.limit) || 20;
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);

  let sql = `
    SELECT sk.ilac_adi, SUM(sk.adet) AS toplam_adet, SUM(sk.ara_toplam) AS toplam_ciro
    FROM satis_kalemleri sk
    JOIN satislar sa ON sa.id = sk.satis_id
    WHERE 1=1 ${kosul}
  `;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY sk.ilac_adi ORDER BY toplam_adet DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  cikisYap(req, res, 'en-cok-satan', 'En Çok Satan İlaçlar', rows, [
    { alan: 'ilac_adi', baslik: 'İlaç' },
    { alan: 'toplam_adet', baslik: 'Satılan Adet' },
    { alan: 'toplam_ciro', baslik: 'Toplam Ciro (TL)' }
  ]);
});

// 13. Kritik stok + SKT raporu
router.get('/kritik-stok-skt', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  // skt: elde stogu kalan partiler arasindaki en yakin son kullanma tarihi
  const sql = subeId
    ? `SELECT i.id, i.ad, i.kritik_stok, COALESCE(s.stok, 0) AS stok,
              (SELECT MIN(p.skt) FROM ilac_partileri p WHERE p.ilac_id = i.id AND p.sube_id = ? AND p.miktar > 0) AS skt
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ? ORDER BY i.ad`
    : `SELECT i.id, i.ad, i.kritik_stok, COALESCE(SUM(s.stok), 0) AS stok,
              (SELECT MIN(p.skt) FROM ilac_partileri p WHERE p.ilac_id = i.id AND p.miktar > 0) AS skt
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id GROUP BY i.id ORDER BY i.ad`;
  const rows = subeId ? db.prepare(sql).all(subeId, subeId) : db.prepare(sql).all();

  const bugun = new Date();
  const otuzGunSonra = new Date(bugun.getTime() + 30 * 24 * 60 * 60 * 1000);
  const filtreli = rows.filter((r) => r.stok <= r.kritik_stok || (r.skt && new Date(r.skt) <= otuzGunSonra));

  cikisYap(req, res, 'kritik-stok-skt-raporu', 'Kritik Stok ve SKT Raporu', filtreli, [
    { alan: 'ad', baslik: 'İlaç' },
    { alan: 'stok', baslik: 'Stok' },
    { alan: 'kritik_stok', baslik: 'Kritik Stok Sınırı' },
    { alan: 'skt', baslik: 'Son Kullanma Tarihi' }
  ]);
});

// 14. Kar-zarar raporu (isletme giderleri dahil net kar)
router.get('/kar-zarar', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);

  let sql = `
    SELECT strftime('%Y-%m-%d', sa.tarih) AS tarih,
           SUM(sk.ara_toplam) AS toplam_satis,
           SUM(sk.alis_fiyati * sk.adet) AS toplam_maliyet,
           SUM(sk.ara_toplam - sk.alis_fiyati * sk.adet) AS kar
    FROM satis_kalemleri sk
    JOIN satislar sa ON sa.id = sk.satis_id
    WHERE 1=1 ${kosul}
  `;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY tarih';

  const satisSatirlari = db.prepare(sql).all(...params);

  const giderKosullar = [];
  const giderParams = [];
  if (req.query.baslangic) {
    giderKosullar.push('tarih >= ?');
    giderParams.push(req.query.baslangic);
  }
  if (req.query.bitis) {
    giderKosullar.push('tarih <= ?');
    giderParams.push(req.query.bitis);
  }
  if (subeId) {
    giderKosullar.push('sube_id = ?');
    giderParams.push(subeId);
  }
  const giderWhere = giderKosullar.length ? ' WHERE ' + giderKosullar.join(' AND ') : '';
  const giderSatirlari = db
    .prepare(`SELECT tarih, SUM(tutar) AS toplam_gider FROM giderler${giderWhere} GROUP BY tarih`)
    .all(...giderParams);

  // Iadeler: iade tutari ciroyu azaltir; stoga geri alinan urunun maliyeti geri kazanilir,
  // stoga alinamayan (hasarli/acilmis) urunun maliyeti zarar olarak kalir.
  const iadeKosul = kosul.replace(/sa\.tarih/g, 'i.tarih');
  let iadeSql = `
    SELECT strftime('%Y-%m-%d', i.tarih) AS tarih,
           SUM(ik.tutar) AS toplam_iade,
           SUM(CASE WHEN i.stoga_alindi = 1 THEN ik.alis_fiyati * ik.adet ELSE 0 END) AS geri_alinan_maliyet
    FROM iade_kalemleri ik
    JOIN iadeler i ON i.id = ik.iade_id
    WHERE 1=1 ${iadeKosul}`;
  const iadeParams = params.slice(0, params.length - (subeId ? 1 : 0));
  if (subeId) {
    iadeSql += ' AND i.sube_id = ?';
    iadeParams.push(subeId);
  }
  iadeSql += ' GROUP BY tarih';
  const iadeSatirlari = db.prepare(iadeSql).all(...iadeParams);

  const bosGun = (tarih) => ({ tarih, toplam_satis: 0, toplam_iade: 0, toplam_maliyet: 0, kar: 0, toplam_gider: 0 });
  const gunMap = new Map();
  for (const r of satisSatirlari) {
    gunMap.set(r.tarih, { ...bosGun(r.tarih), toplam_satis: r.toplam_satis, toplam_maliyet: r.toplam_maliyet, kar: r.kar });
  }
  for (const i of iadeSatirlari) {
    const mevcut = gunMap.get(i.tarih) || bosGun(i.tarih);
    mevcut.toplam_iade = i.toplam_iade;
    mevcut.toplam_maliyet -= i.geri_alinan_maliyet;
    mevcut.kar -= i.toplam_iade - i.geri_alinan_maliyet;
    gunMap.set(i.tarih, mevcut);
  }
  for (const g of giderSatirlari) {
    const mevcut = gunMap.get(g.tarih) || bosGun(g.tarih);
    mevcut.toplam_gider = g.toplam_gider;
    gunMap.set(g.tarih, mevcut);
  }

  const rows = Array.from(gunMap.values())
    .map((r) => ({ ...r, net_kar: r.kar - r.toplam_gider }))
    .sort((a, b) => (a.tarih < b.tarih ? 1 : -1));

  cikisYap(req, res, 'kar-zarar-raporu', 'Kâr-Zarar Raporu', rows, [
    { alan: 'tarih', baslik: 'Tarih' },
    { alan: 'toplam_satis', baslik: 'Toplam Satış (TL)' },
    { alan: 'toplam_iade', baslik: 'İade (TL)' },
    { alan: 'toplam_maliyet', baslik: 'Mal Maliyeti (TL)' },
    { alan: 'kar', baslik: 'Brüt Kâr (TL)' },
    { alan: 'toplam_gider', baslik: 'İşletme Gideri (TL)' },
    { alan: 'net_kar', baslik: 'Net Kâr (TL)' }
  ]);
});

// 15. Recete/SGK islem raporu
router.get('/recete-sgk', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);

  let sql = `
    SELECT sa.id, sa.tarih, sa.toplam_tutar, sa.odeme_tipi, m.ad_soyad AS musteri_adi,
           sa.recete_no, sa.recete_turu, sa.doktor_adi
    FROM satislar sa
    LEFT JOIN musteriler m ON m.id = sa.musteri_id
    WHERE (sa.sgk_recete = 1 OR sa.recete_no IS NOT NULL) ${kosul}
  `;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY sa.tarih DESC';

  const rows = db.prepare(sql).all(...params);
  cikisYap(req, res, 'recete-sgk-raporu', 'Reçete/SGK İşlem Raporu', rows, [
    { alan: 'id', baslik: 'Satış No' },
    { alan: 'tarih', baslik: 'Tarih' },
    { alan: 'musteri_adi', baslik: 'Müşteri' },
    { alan: 'recete_no', baslik: 'Reçete No' },
    { alan: 'recete_turu', baslik: 'Reçete Türü' },
    { alan: 'doktor_adi', baslik: 'Doktor' },
    { alan: 'toplam_tutar', baslik: 'Tutar (TL)' }
  ]);
});

// Kontrollu ilac defteri: kirmizi/yesil receteli ilaclarin tum stok giris-cikislari,
// satislarda recete no, doktor ve hasta bilgisi, ilac bazinda yuruyen bakiye
router.get('/kontrollu-ilac', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id) || req.user.sube_id;
  const yer = KONTROLLU_TURLER.map(() => '?').join(',');
  let sql = `
    SELECT h.id, h.tarih, h.ilac_id, i.ad AS ilac_adi, i.recete_turu AS ilac_recete, h.tip, h.adet, h.aciklama,
           CAST(substr(h.aciklama, 8) AS INTEGER) AS satis_no
    FROM stok_hareketleri h JOIN ilaclar i ON i.id = h.ilac_id
    WHERE h.sube_id = ? AND i.recete_turu IN (${yer})`;
  const params = [subeId, ...KONTROLLU_TURLER];
  if (req.query.baslangic) {
    sql += ' AND h.tarih >= ?';
    params.push(req.query.baslangic);
  }
  if (req.query.bitis) {
    sql += ' AND h.tarih <= ?';
    params.push(req.query.bitis + ' 23:59:59');
  }
  sql += ' ORDER BY i.ad, h.tarih, h.id';
  const hareketler = db.prepare(sql).all(...params);

  const satisBilgisi = db.prepare(
    `SELECT sa.recete_no, sa.recete_turu, sa.doktor_adi, sa.hasta_tc, m.ad_soyad AS hasta
     FROM satislar sa LEFT JOIN musteriler m ON m.id = sa.musteri_id WHERE sa.id = ?`
  );
  // Donem oncesi bakiye: mevcut stoktan donem icindeki net hareket cikarilir
  const mevcut = db.prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?');
  const netDonem = {};
  for (const h of hareketler) netDonem[h.ilac_id] = (netDonem[h.ilac_id] || 0) + (h.tip === 'giris' ? h.adet : -h.adet);
  const bakiye = {};

  const rows = hareketler.map((h) => {
    if (bakiye[h.ilac_id] === undefined) {
      bakiye[h.ilac_id] = ((mevcut.get(h.ilac_id, subeId) || { stok: 0 }).stok) - netDonem[h.ilac_id];
    }
    bakiye[h.ilac_id] += h.tip === 'giris' ? h.adet : -h.adet;
    const satis = h.tip === 'cikis' && /^Sat(is|ış) #\d+$/.test(h.aciklama || '') ? satisBilgisi.get(h.satis_no) : null;
    return {
      tarih: h.tarih,
      ilac_adi: h.ilac_adi,
      recete_rengi: RECETE_TURLERI[h.ilac_recete],
      giris: h.tip === 'giris' ? h.adet : '',
      cikis: h.tip === 'cikis' ? h.adet : '',
      bakiye: bakiye[h.ilac_id],
      aciklama: h.aciklama || '',
      recete_no: satis ? satis.recete_no : '',
      doktor: satis ? satis.doktor_adi : '',
      hasta: satis ? satis.hasta || '' : '',
      hasta_tc: satis ? satis.hasta_tc || '' : ''
    };
  });
  cikisYap(req, res, 'kontrollu-ilac-defteri', 'Kontrollü İlaç Defteri', rows, [
    { alan: 'tarih', baslik: 'Tarih' },
    { alan: 'ilac_adi', baslik: 'İlaç' },
    { alan: 'recete_rengi', baslik: 'Reçete' },
    { alan: 'giris', baslik: 'Giriş' },
    { alan: 'cikis', baslik: 'Çıkış' },
    { alan: 'bakiye', baslik: 'Bakiye' },
    { alan: 'recete_no', baslik: 'Reçete No' },
    { alan: 'doktor', baslik: 'Doktor' },
    { alan: 'hasta', baslik: 'Hasta' },
    { alan: 'hasta_tc', baslik: 'Hasta TC' },
    { alan: 'aciklama', baslik: 'Açıklama' }
  ]);
});

// 16. Stok degeri raporu (muhasebe/sigorta icin envanter degerlemesi)
router.get('/stok-degeri', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);

  let sql;
  const params = [];
  if (subeId) {
    sql = `
      SELECT COALESCE(i.kategori, 'Diğer') AS kategori,
             COUNT(DISTINCT i.id) AS urun_cesidi,
             SUM(COALESCE(s.stok, 0)) AS toplam_adet,
             SUM(COALESCE(s.stok, 0) * i.alis_fiyati) AS alis_degeri,
             SUM(COALESCE(s.stok, 0) * i.satis_fiyati) AS satis_degeri
      FROM ilaclar i
      LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
      GROUP BY kategori
      ORDER BY alis_degeri DESC
    `;
    params.push(subeId);
  } else {
    sql = `
      SELECT COALESCE(i.kategori, 'Diğer') AS kategori,
             COUNT(DISTINCT i.id) AS urun_cesidi,
             SUM(COALESCE(s.stok, 0)) AS toplam_adet,
             SUM(COALESCE(s.stok, 0) * i.alis_fiyati) AS alis_degeri,
             SUM(COALESCE(s.stok, 0) * i.satis_fiyati) AS satis_degeri
      FROM ilaclar i
      LEFT JOIN ilac_stok s ON s.ilac_id = i.id
      GROUP BY kategori
      ORDER BY alis_degeri DESC
    `;
  }

  const rows = db.prepare(sql).all(...params);
  cikisYap(req, res, 'stok-degeri-raporu', 'Stok Değeri Raporu', rows, [
    { alan: 'kategori', baslik: 'Kategori' },
    { alan: 'urun_cesidi', baslik: 'Ürün Çeşidi' },
    { alan: 'toplam_adet', baslik: 'Toplam Adet' },
    { alan: 'alis_degeri', baslik: 'Alış Değeri (TL)' },
    { alan: 'satis_degeri', baslik: 'Satış Değeri (TL)' }
  ]);
});

// 17. Personel satis performans raporu
router.get('/personel-performans', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);

  let sql = `
    SELECT u.ad_soyad AS personel, u.rol,
           COUNT(sa.id) AS satis_adedi,
           SUM(sa.toplam_tutar) AS toplam_ciro,
           ROUND(AVG(sa.toplam_tutar), 2) AS ortalama_sepet
    FROM satislar sa
    JOIN kullanicilar u ON u.id = sa.kullanici_id
    WHERE 1=1 ${kosul}
  `;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY sa.kullanici_id ORDER BY toplam_ciro DESC';

  const rows = db.prepare(sql).all(...params);
  cikisYap(req, res, 'personel-performans-raporu', 'Personel Satış Performans Raporu', rows, [
    { alan: 'personel', baslik: 'Personel' },
    { alan: 'rol', baslik: 'Rol' },
    { alan: 'satis_adedi', baslik: 'Satış Adedi' },
    { alan: 'toplam_ciro', baslik: 'Toplam Ciro (TL)' },
    { alan: 'ortalama_sepet', baslik: 'Ortalama Sepet (TL)' }
  ]);
});

// 18. Urun tipi bazinda satis (ilac / dermokozmetik / takviye / medikal)
router.get('/urun-tipi', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);

  let sql = `
    SELECT COALESCE(i.urun_tipi, 'ilac') AS urun_tipi,
           SUM(sk.adet) AS toplam_adet,
           SUM(sk.ara_toplam) AS toplam_ciro,
           SUM(sk.ara_toplam - sk.alis_fiyati * sk.adet) AS brut_kar
    FROM satis_kalemleri sk
    JOIN satislar sa ON sa.id = sk.satis_id
    JOIN ilaclar i ON i.id = sk.ilac_id
    WHERE 1=1 ${kosul}
  `;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY urun_tipi ORDER BY toplam_ciro DESC';

  const rows = db.prepare(sql).all(...params);
  const toplamCiro = rows.reduce((t, r) => t + r.toplam_ciro, 0);
  const sonuc = rows.map((r) => ({
    ...r,
    urun_tipi_adi: URUN_TIPLERI[r.urun_tipi] || r.urun_tipi,
    ciro_payi: toplamCiro ? Math.round((r.toplam_ciro / toplamCiro) * 1000) / 10 : 0
  }));

  cikisYap(req, res, 'urun-tipi-raporu', 'Ürün Tipi Bazında Satış', sonuc, [
    { alan: 'urun_tipi_adi', baslik: 'Ürün Tipi' },
    { alan: 'toplam_adet', baslik: 'Satılan Adet' },
    { alan: 'toplam_ciro', baslik: 'Ciro (TL)' },
    { alan: 'ciro_payi', baslik: 'Ciro Payı (%)' },
    { alan: 'brut_kar', baslik: 'Brüt Kâr (TL)' }
  ]);
});

// Kampanya performansi: hangi kampanya kac kalemde kullanildi, ne kadar indirim verildi
router.get('/kampanya-performansi', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);
  let sql = `
    SELECT sk.kampanya_adi,
           COUNT(DISTINCT sk.satis_id) AS satis_adedi,
           SUM(sk.adet) AS toplam_adet,
           SUM(sk.kalem_indirimi) AS toplam_indirim,
           SUM(sk.ara_toplam) AS net_ciro,
           SUM(sk.ara_toplam - sk.alis_fiyati * sk.adet) AS brut_kar
    FROM satis_kalemleri sk
    JOIN satislar sa ON sa.id = sk.satis_id
    WHERE sk.kampanya_adi IS NOT NULL ${kosul}`;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY sk.kampanya_adi ORDER BY toplam_indirim DESC';
  cikisYap(req, res, 'kampanya-performansi', 'Kampanya Performansı', db.prepare(sql).all(...params), [
    { alan: 'kampanya_adi', baslik: 'Kampanya' },
    { alan: 'satis_adedi', baslik: 'Satış Adedi' },
    { alan: 'toplam_adet', baslik: 'Ürün Adedi' },
    { alan: 'toplam_indirim', baslik: 'Verilen İndirim (TL)' },
    { alan: 'net_ciro', baslik: 'Net Ciro (TL)' },
    { alan: 'brut_kar', baslik: 'Brüt Kâr (TL)' }
  ]);
});

// Olu stok: elde stogu olup son `gun` gun (varsayilan 90) hic satilmayan urunler
// ve bunlara bagli sermaye (alis fiyatiyla)
router.get('/olu-stok', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id) || req.user.sube_id;
  const gun = Math.min(730, Math.max(7, Number(req.query.gun) || 90));
  const rows = db
    .prepare(
      `SELECT i.id, i.ad, i.kategori, i.urun_tipi, s.stok, i.alis_fiyati,
              ROUND(s.stok * i.alis_fiyati, 2) AS bagli_sermaye,
              (SELECT MAX(date(sa.tarih)) FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
                WHERE sk.ilac_id = i.id AND sa.sube_id = s.sube_id) AS son_satis,
              (SELECT MIN(p.skt) FROM ilac_partileri p WHERE p.ilac_id = i.id AND p.sube_id = s.sube_id AND p.miktar > 0) AS en_yakin_skt
       FROM ilac_stok s
       JOIN ilaclar i ON i.id = s.ilac_id
       WHERE s.sube_id = ? AND s.stok > 0
         AND NOT EXISTS (SELECT 1 FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
                          WHERE sk.ilac_id = i.id AND sa.sube_id = s.sube_id AND sa.tarih >= datetime('now', ?))
       ORDER BY bagli_sermaye DESC`
    )
    .all(subeId, `-${gun} days`)
    .map((r) => ({ ...r, son_satis: r.son_satis || 'Hic satilmadi', en_yakin_skt: r.en_yakin_skt || '-' }));

  cikisYap(req, res, 'olu-stok-raporu', `Olu Stok (${gun} gundur satilmayan)`, rows, [
    { alan: 'ad', baslik: 'Ürün' },
    { alan: 'kategori', baslik: 'Kategori' },
    { alan: 'stok', baslik: 'Stok' },
    { alan: 'son_satis', baslik: 'Son Satış' },
    { alan: 'en_yakin_skt', baslik: 'En Yakın SKT' },
    { alan: 'bagli_sermaye', baslik: 'Bağlı Sermaye (TL)' }
  ]);
});

// ABC analizi: urunler ciro payina gore siralanir; kumulatif %80'e kadar A,
// %95'e kadar B, kalani C (varsayilan son 90 gun)
router.get('/abc', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const baslangic = req.query.baslangic || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { kosul, params } = tarihFiltresi(baslangic, req.query.bitis);
  let sql = `
    SELECT sk.ilac_id, i.ad, SUM(sk.adet) AS adet, SUM(sk.ara_toplam) AS ciro,
           SUM(sk.ara_toplam - sk.alis_fiyati * sk.adet) AS brut_kar
    FROM satis_kalemleri sk
    JOIN satislar sa ON sa.id = sk.satis_id
    JOIN ilaclar i ON i.id = sk.ilac_id
    WHERE 1=1 ${kosul}`;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY sk.ilac_id ORDER BY ciro DESC';
  const satirlar = db.prepare(sql).all(...params);
  const toplam = satirlar.reduce((t, r) => t + r.ciro, 0);
  let kumulatif = 0;
  const rows = satirlar.map((r) => {
    const pay = toplam ? (r.ciro / toplam) * 100 : 0;
    // Sinif, urunun kumulatife eklenmeden onceki konumuna gore verilir:
    // tek basina %80'i asan ilk urun de A olur
    const sinif = kumulatif < 80 ? 'A' : kumulatif < 95 ? 'B' : 'C';
    kumulatif += pay;
    return {
      ...r,
      ciro: Math.round(r.ciro * 100) / 100,
      brut_kar: Math.round(r.brut_kar * 100) / 100,
      pay: Math.round(pay * 10) / 10,
      kumulatif_pay: Math.round(kumulatif * 10) / 10,
      sinif
    };
  });
  cikisYap(req, res, 'abc-analizi', 'ABC Analizi', rows, [
    { alan: 'sinif', baslik: 'Sınıf' },
    { alan: 'ad', baslik: 'Ürün' },
    { alan: 'adet', baslik: 'Adet' },
    { alan: 'ciro', baslik: 'Ciro (TL)' },
    { alan: 'pay', baslik: 'Pay (%)' },
    { alan: 'kumulatif_pay', baslik: 'Kümülatif (%)' },
    { alan: 'brut_kar', baslik: 'Brüt Kâr (TL)' }
  ]);
});

// Tedarikci fiyat karsilastirma: mal kabullerdeki gercek birim maliyetler (MF dahil)
router.get('/tedarikci-fiyat', (req, res) => {
  const satirlar = db
    .prepare(
      `SELECT mkk.ilac_id, i.ad AS ilac_adi, mk.tedarikci_id, t.firma_adi AS tedarikci,
              COUNT(*) AS alim_sayisi, SUM(mkk.adet + mkk.mf) AS toplam_adet,
              ROUND(AVG(mkk.birim_maliyet), 2) AS ortalama_maliyet,
              MAX(mk.tarih) AS son_alim,
              (SELECT x.birim_maliyet FROM mal_kabul_kalemleri x JOIN mal_kabulleri y ON y.id = x.mal_kabul_id
                WHERE x.ilac_id = mkk.ilac_id AND y.tedarikci_id IS mk.tedarikci_id ORDER BY y.tarih DESC, x.id DESC LIMIT 1) AS son_maliyet
       FROM mal_kabul_kalemleri mkk
       JOIN mal_kabulleri mk ON mk.id = mkk.mal_kabul_id
       JOIN ilaclar i ON i.id = mkk.ilac_id
       LEFT JOIN tedarikciler t ON t.id = mk.tedarikci_id
       GROUP BY mkk.ilac_id, mk.tedarikci_id
       ORDER BY i.ad, son_maliyet`
    )
    .all();
  const enUcuz = new Map();
  for (const r of satirlar) {
    if (!enUcuz.has(r.ilac_id) || r.son_maliyet < enUcuz.get(r.ilac_id)) enUcuz.set(r.ilac_id, r.son_maliyet);
  }
  const rows = satirlar.map((r) => {
    const min = enUcuz.get(r.ilac_id);
    return {
      ...r,
      tedarikci: r.tedarikci || 'Belirtilmemis',
      son_alim: String(r.son_alim).slice(0, 10),
      en_ucuz: r.son_maliyet === min ? 'Evet' : '',
      fark_yuzde: min ? Math.round(((r.son_maliyet - min) / min) * 1000) / 10 : 0
    };
  });
  cikisYap(req, res, 'tedarikci-fiyat-karsilastirma', 'Tedarikçi Fiyat Karşılaştırma', rows, [
    { alan: 'ilac_adi', baslik: 'Ürün' },
    { alan: 'tedarikci', baslik: 'Tedarikçi' },
    { alan: 'son_maliyet', baslik: 'Son Birim Maliyet (TL)' },
    { alan: 'ortalama_maliyet', baslik: 'Ortalama (TL)' },
    { alan: 'fark_yuzde', baslik: 'En Ucuzdan Fark (%)' },
    { alan: 'en_ucuz', baslik: 'En Ucuz' },
    { alan: 'alim_sayisi', baslik: 'Alim Sayisi' },
    { alan: 'son_alim', baslik: 'Son Alim' }
  ]);
});

// Saatlik yogunluk: haftanin gunu x saat (yerel saat) satis adedi ve cirosu
router.get('/yogunluk', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const gun = Math.min(365, Math.max(7, Number(req.query.gun) || 30));
  const fark = sqlSaatFarki();
  let sql = `
    SELECT CAST(strftime('%w', sa.tarih, ?) AS INTEGER) AS haftagunu,
           CAST(strftime('%H', sa.tarih, ?) AS INTEGER) AS saat,
           COUNT(*) AS adet, SUM(sa.toplam_tutar) AS ciro
    FROM satislar sa
    WHERE sa.tarih >= datetime('now', ?)`;
  const params = [fark, fark, `-${gun} days`];
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY haftagunu, saat';
  // Pazartesi ilk satir: SQLite %w pazar=0 verir
  const matris = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ adet: 0, ciro: 0 })));
  let enYogun = null;
  for (const r of db.prepare(sql).all(...params)) {
    const satir = (r.haftagunu + 6) % 7;
    matris[satir][r.saat] = { adet: r.adet, ciro: Math.round(r.ciro * 100) / 100 };
    if (!enYogun || r.adet > enYogun.adet) enYogun = { gun: satir, saat: r.saat, adet: r.adet };
  }
  res.json({ gun, saat_farki: fark, matris, en_yogun: enYogun });
});

// Iade raporu
router.get('/iadeler', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);
  let sql = `
    SELECT i.id, i.tarih, i.satis_id, i.toplam_tutar, i.odeme_tipi, i.neden,
           CASE WHEN i.stoga_alindi = 1 THEN 'Evet' ELSE 'Hayir' END AS stoga_alindi,
           u.ad_soyad AS kullanici_adi,
           (SELECT GROUP_CONCAT(ik.ilac_adi || ' x' || ik.adet, ', ') FROM iade_kalemleri ik WHERE ik.iade_id = i.id) AS urunler
    FROM iadeler i
    LEFT JOIN kullanicilar u ON u.id = i.kullanici_id
    WHERE 1=1 ${kosul.replace(/sa\.tarih/g, 'i.tarih')}`;
  if (subeId) {
    sql += ' AND i.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY i.tarih DESC';
  cikisYap(req, res, 'iade-raporu', 'İade Raporu', db.prepare(sql).all(...params), [
    { alan: 'id', baslik: 'İade No' },
    { alan: 'tarih', baslik: 'Tarih' },
    { alan: 'satis_id', baslik: 'Satış No' },
    { alan: 'urunler', baslik: 'Urunler' },
    { alan: 'toplam_tutar', baslik: 'Tutar (TL)' },
    { alan: 'odeme_tipi', baslik: 'Ödeme' },
    { alan: 'stoga_alindi', baslik: 'Stoga Alindi' },
    { alan: 'neden', baslik: 'Neden' },
    { alan: 'kullanici_adi', baslik: 'Kullanıcı' }
  ]);
});

// Parti bazli SKT raporu: onumuzdeki N gun icinde (varsayilan 180) SKT'si dolacak
// veya dolmus, elde stogu kalan lotlar ve bunlarin alis maliyeti
router.get('/parti-skt', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const gun = Math.min(3650, Math.max(1, Number(req.query.gun) || 180));
  const sinir = new Date(Date.now() + gun * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let sql = `
    SELECT p.id AS parti_id, i.ad AS ilac_adi, p.parti_no, p.skt, p.miktar,
           sb.ad AS sube_adi, ROUND(p.miktar * i.alis_fiyati, 2) AS alis_degeri,
           CAST(julianday(p.skt) - julianday(date('now')) AS INTEGER) AS kalan_gun
    FROM ilac_partileri p
    JOIN ilaclar i ON i.id = p.ilac_id
    JOIN subeler sb ON sb.id = p.sube_id
    WHERE p.miktar > 0 AND p.skt IS NOT NULL AND p.skt <= ?`;
  const params = [sinir];
  if (subeId) {
    sql += ' AND p.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY p.skt, i.ad';
  const rows = db.prepare(sql).all(...params).map((r) => ({ ...r, parti_no: r.parti_no || '-' }));

  cikisYap(req, res, 'parti-skt-raporu', 'Parti Bazli SKT Raporu', rows, [
    { alan: 'ilac_adi', baslik: 'Ürün' },
    { alan: 'parti_no', baslik: 'Parti No' },
    { alan: 'sube_adi', baslik: 'Şube' },
    { alan: 'skt', baslik: 'SKT' },
    { alan: 'kalan_gun', baslik: 'Kalan Gün' },
    { alan: 'miktar', baslik: 'Miktar' },
    { alan: 'alis_degeri', baslik: 'Alış Değeri (TL)' }
  ]);
});

module.exports = router;
