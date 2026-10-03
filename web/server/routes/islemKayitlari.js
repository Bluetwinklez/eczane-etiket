const express = require('express');
const { db } = require('../db');
const { sendCsv } = require('../export');

const router = express.Router();

router.get('/', (req, res) => {
  const { kullanici_id, kaynak, yontem, baslangic, bitis, sadece_hatalar } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 2000);

  const kosullar = [];
  const params = [];
  if (kullanici_id) {
    kosullar.push('kullanici_id = ?');
    params.push(Number(kullanici_id));
  }
  if (kaynak) {
    kosullar.push('kaynak = ?');
    params.push(kaynak);
  }
  if (yontem) {
    kosullar.push('yontem = ?');
    params.push(yontem);
  }
  if (baslangic) {
    kosullar.push('date(tarih) >= ?');
    params.push(baslangic);
  }
  if (bitis) {
    kosullar.push('date(tarih) <= ?');
    params.push(bitis);
  }
  if (sadece_hatalar === '1') kosullar.push('durum_kodu >= 400');

  const where = kosullar.length ? ' WHERE ' + kosullar.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM islem_kayitlari${where} ORDER BY id DESC LIMIT ?`).all(...params, limit);

  if (req.query.format === 'csv') {
    return sendCsv(res, 'islem-kaydi.csv', rows, [
      { alan: 'tarih', baslik: 'Tarih' },
      { alan: 'kullanici_adi', baslik: 'Kullanıcı' },
      { alan: 'yontem', baslik: 'İşlem' },
      { alan: 'yol', baslik: 'Adres' },
      { alan: 'durum_kodu', baslik: 'Sonuç' },
      { alan: 'detay', baslik: 'Detay' },
      { alan: 'ip', baslik: 'IP' }
    ]);
  }
  res.json(rows);
});

router.get('/kaynaklar', (req, res) => {
  res.json(db.prepare('SELECT DISTINCT kaynak FROM islem_kayitlari WHERE kaynak IS NOT NULL ORDER BY kaynak').all().map((r) => r.kaynak));
});

module.exports = router;
