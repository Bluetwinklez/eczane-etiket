const express = require('express');
const { db } = require('../db');
const { bildirimGonder } = require('../bildirim');

const router = express.Router();

// Toplu mesaj alici gruplari. Ticari ileti onayi (IYS) olmayan musteriler hicbir
// gruba dahil edilmez.
const SEGMENTLER = {
  tumu: { ad: 'Tum onayli musteriler', sql: '1=1' },
  dermokozmetik: { ad: 'Son 180 gunde dermokozmetik alanlar', sql: urunTipiAlanlar('dermokozmetik') },
  takviye: { ad: 'Son 180 gunde gida takviyesi alanlar', sql: urunTipiAlanlar('takviye') },
  medikal: { ad: 'Son 180 gunde medikal urun alanlar', sql: urunTipiAlanlar('medikal') },
  kronik: {
    ad: 'Kronik ilac kullananlar (son 90 gun)',
    sql: `m.id IN (SELECT sa.musteri_id FROM satislar sa JOIN satis_kalemleri sk ON sk.satis_id = sa.id
           JOIN ilaclar i ON i.id = sk.ilac_id WHERE i.kutu_gun > 0 AND sa.tarih >= datetime('now', '-90 days'))`
  },
  pasif: {
    ad: '90 gundur alisveris yapmayanlar',
    sql: `m.id NOT IN (SELECT musteri_id FROM satislar WHERE musteri_id IS NOT NULL AND tarih >= datetime('now', '-90 days'))`
  },
  puanli: { ad: '500+ puani olanlar', sql: 'COALESCE((SELECT SUM(puan) FROM puan_hareketleri p WHERE p.musteri_id = m.id), 0) >= 500' }
};

function urunTipiAlanlar(tip) {
  return `m.id IN (SELECT sa.musteri_id FROM satislar sa JOIN satis_kalemleri sk ON sk.satis_id = sa.id
           JOIN ilaclar i ON i.id = sk.ilac_id WHERE i.urun_tipi = '${tip}' AND sa.tarih >= datetime('now', '-180 days'))`;
}

function alicilar(segment, kanal) {
  const s = SEGMENTLER[segment];
  if (!s) return null;
  const iletisim = kanal === 'sms' ? "m.telefon IS NOT NULL AND m.telefon != ''" : "m.email IS NOT NULL AND m.email != ''";
  return db.prepare(`SELECT m.* FROM musteriler m WHERE m.ileti_izni = 1 AND ${iletisim} AND ${s.sql} ORDER BY m.ad_soyad`).all();
}

router.get('/toplu/segmentler', (req, res) => {
  res.json(Object.entries(SEGMENTLER).map(([kod, s]) => ({ kod, ad: s.ad })));
});

router.post('/toplu', async (req, res) => {
  const { segment, mesaj, onizleme } = req.body;
  const kanal = req.body.kanal || 'sms';
  if (!['sms', 'email'].includes(kanal)) return res.status(400).json({ error: 'Kanal sms veya email olmali' });
  const liste = alicilar(segment, kanal);
  if (!liste) return res.status(400).json({ error: 'Gecersiz alici grubu' });
  const metin = String(mesaj || '').trim();
  if (!metin) return res.status(400).json({ error: 'Mesaj bos olamaz' });
  if (kanal === 'sms' && metin.length > 459) return res.status(400).json({ error: 'SMS en fazla 459 karakter (3 mesaj) olabilir' });
  if (liste.length > 500) return res.status(400).json({ error: 'Tek seferde en fazla 500 aliciya gonderilir' });

  const kisisel = (m) => metin.replace(/\{ad\}/g, m.ad_soyad.split(' ')[0]).replace(/\{adsoyad\}/g, m.ad_soyad);
  if (onizleme) {
    return res.json({
      alici_sayisi: liste.length,
      ornek_alicilar: liste.slice(0, 5).map((m) => m.ad_soyad),
      ornek_mesaj: liste.length ? kisisel(liste[0]) : metin,
      sms_parca: kanal === 'sms' ? Math.ceil(metin.length / 153) || 1 : null
    });
  }
  if (!liste.length) return res.status(400).json({ error: 'Bu grupta onayli alici yok' });
  const sonuc = { gonderildi: 0, simule: 0, hata: 0 };
  for (const m of liste) {
    const b = await bildirimGonder(m, kanal, kisisel(m));
    sonuc[b.durum] = (sonuc[b.durum] || 0) + 1;
  }
  res.json({ alici_sayisi: liste.length, sonuc });
});

router.get('/', (req, res) => {
  const { musteri_id, durum } = req.query;
  let sql = `
    SELECT b.*, m.ad_soyad AS musteri_adi
    FROM bildirimler b
    LEFT JOIN musteriler m ON m.id = b.musteri_id
    WHERE 1=1
  `;
  const params = [];
  if (musteri_id) {
    sql += ' AND b.musteri_id = ?';
    params.push(Number(musteri_id));
  }
  if (durum) {
    sql += ' AND b.durum = ?';
    params.push(durum);
  }
  sql += ' ORDER BY b.tarih DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', async (req, res) => {
  const { musteri_id, kanal, mesaj } = req.body;
  if (!musteri_id || !['email', 'sms'].includes(kanal) || !mesaj || !mesaj.trim()) {
    return res.status(400).json({ error: 'Musteri, kanal (email/sms) ve mesaj zorunludur' });
  }

  const musteri = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(musteri_id);
  if (!musteri) return res.status(404).json({ error: 'Musteri bulunamadi' });

  const sonuc = await bildirimGonder(musteri, kanal, mesaj.trim());
  res.status(201).json(sonuc);
});

module.exports = router;
