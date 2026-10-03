const express = require('express');
const { db } = require('../db');
const { sendCsv, sendPdf } = require('../export');
const { URUN_TIPLERI } = require('../sabitler');

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
  cikisYap(req, res, 'satis-raporu', 'Satis Raporu', rows, [
    { alan: 'donem', baslik: 'Donem' },
    { alan: 'satis_adedi', baslik: 'Satis Adedi' },
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
  cikisYap(req, res, 'en-cok-satan', 'En Cok Satan Ilaclar', rows, [
    { alan: 'ilac_adi', baslik: 'Ilac' },
    { alan: 'toplam_adet', baslik: 'Satilan Adet' },
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
    { alan: 'ad', baslik: 'Ilac' },
    { alan: 'stok', baslik: 'Stok' },
    { alan: 'kritik_stok', baslik: 'Kritik Stok Siniri' },
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

  const gunMap = new Map();
  for (const r of satisSatirlari) {
    gunMap.set(r.tarih, { tarih: r.tarih, toplam_satis: r.toplam_satis, toplam_maliyet: r.toplam_maliyet, kar: r.kar, toplam_gider: 0 });
  }
  for (const g of giderSatirlari) {
    const mevcut = gunMap.get(g.tarih) || { tarih: g.tarih, toplam_satis: 0, toplam_maliyet: 0, kar: 0, toplam_gider: 0 };
    mevcut.toplam_gider = g.toplam_gider;
    gunMap.set(g.tarih, mevcut);
  }

  const rows = Array.from(gunMap.values())
    .map((r) => ({ ...r, net_kar: r.kar - r.toplam_gider }))
    .sort((a, b) => (a.tarih < b.tarih ? 1 : -1));

  cikisYap(req, res, 'kar-zarar-raporu', 'Kar-Zarar Raporu', rows, [
    { alan: 'tarih', baslik: 'Tarih' },
    { alan: 'toplam_satis', baslik: 'Toplam Satis (TL)' },
    { alan: 'toplam_maliyet', baslik: 'Mal Maliyeti (TL)' },
    { alan: 'kar', baslik: 'Brut Kar (TL)' },
    { alan: 'toplam_gider', baslik: 'Isletme Gideri (TL)' },
    { alan: 'net_kar', baslik: 'Net Kar (TL)' }
  ]);
});

// 15. Recete/SGK islem raporu
router.get('/recete-sgk', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const { kosul, params } = tarihFiltresi(req.query.baslangic, req.query.bitis);

  let sql = `
    SELECT sa.id, sa.tarih, sa.toplam_tutar, sa.odeme_tipi, m.ad_soyad AS musteri_adi
    FROM satislar sa
    LEFT JOIN musteriler m ON m.id = sa.musteri_id
    WHERE sa.sgk_recete = 1 ${kosul}
  `;
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY sa.tarih DESC';

  const rows = db.prepare(sql).all(...params);
  cikisYap(req, res, 'recete-sgk-raporu', 'Recete/SGK Islem Raporu', rows, [
    { alan: 'id', baslik: 'Satis No' },
    { alan: 'tarih', baslik: 'Tarih' },
    { alan: 'musteri_adi', baslik: 'Musteri' },
    { alan: 'toplam_tutar', baslik: 'Tutar (TL)' }
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
  cikisYap(req, res, 'stok-degeri-raporu', 'Stok Degeri Raporu', rows, [
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
  cikisYap(req, res, 'personel-performans-raporu', 'Personel Satis Performans Raporu', rows, [
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

  cikisYap(req, res, 'urun-tipi-raporu', 'Urun Tipi Bazinda Satis', sonuc, [
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
  cikisYap(req, res, 'kampanya-performansi', 'Kampanya Performansi', db.prepare(sql).all(...params), [
    { alan: 'kampanya_adi', baslik: 'Kampanya' },
    { alan: 'satis_adedi', baslik: 'Satis Adedi' },
    { alan: 'toplam_adet', baslik: 'Urun Adedi' },
    { alan: 'toplam_indirim', baslik: 'Verilen Indirim (TL)' },
    { alan: 'net_ciro', baslik: 'Net Ciro (TL)' },
    { alan: 'brut_kar', baslik: 'Brut Kar (TL)' }
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
    { alan: 'ilac_adi', baslik: 'Urun' },
    { alan: 'parti_no', baslik: 'Parti No' },
    { alan: 'sube_adi', baslik: 'Sube' },
    { alan: 'skt', baslik: 'SKT' },
    { alan: 'kalan_gun', baslik: 'Kalan Gun' },
    { alan: 'miktar', baslik: 'Miktar' },
    { alan: 'alis_degeri', baslik: 'Alis Degeri (TL)' }
  ]);
});

module.exports = router;
