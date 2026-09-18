const express = require('express');
const { db } = require('../db');
const { sendCsv, sendPdf } = require('../export');

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
  const sql = subeId
    ? `SELECT i.*, COALESCE(s.stok, 0) AS stok FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ? ORDER BY i.ad`
    : `SELECT i.*, COALESCE(SUM(s.stok), 0) AS stok FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id GROUP BY i.id ORDER BY i.ad`;
  const rows = subeId ? db.prepare(sql).all(subeId) : db.prepare(sql).all();

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

// 14. Kar-zarar raporu
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
  sql += ' GROUP BY tarih ORDER BY tarih DESC';

  const rows = db.prepare(sql).all(...params);
  cikisYap(req, res, 'kar-zarar-raporu', 'Kar-Zarar Raporu', rows, [
    { alan: 'tarih', baslik: 'Tarih' },
    { alan: 'toplam_satis', baslik: 'Toplam Satis (TL)' },
    { alan: 'toplam_maliyet', baslik: 'Toplam Maliyet (TL)' },
    { alan: 'kar', baslik: 'Kar (TL)' }
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

module.exports = router;
