const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { yerelSimdi } = require('../zaman');

const router = express.Router();
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

function gunEkle(tarih, n) {
  const d = new Date(tarih + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Verilen tarihin haftasinin pazartesisi
function haftaBasi(tarih) {
  const d = new Date(tarih + 'T00:00:00Z');
  const gun = (d.getUTCDay() + 6) % 7;
  return gunEkle(tarih, -gun);
}

// Bitis baslangictan once/esitse gece yarisini gecer (orn. nobet 08:30 - 08:30 = 24 saat)
function sureSaat(baslangic, bitis) {
  if (!baslangic || !bitis) return 0;
  const dk = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  let fark = dk(bitis) - dk(baslangic);
  if (fark <= 0) fark += 24 * 60;
  return Math.round((fark / 60) * 100) / 100;
}

router.get('/', (req, res) => {
  const istenen = TARIH.test(String(req.query.hafta)) ? req.query.hafta : yerelSimdi().toISOString().slice(0, 10);
  const pazartesi = haftaBasi(istenen);
  const gunler = Array.from({ length: 7 }, (_, i) => gunEkle(pazartesi, i));
  const personel = db
    .prepare('SELECT id, ad_soyad, rol FROM kullanicilar WHERE sube_id = ? AND aktif = 1 ORDER BY rol, ad_soyad')
    .all(req.user.sube_id);
  const vardiyalar = db
    .prepare('SELECT * FROM vardiyalar WHERE sube_id = ? AND tarih BETWEEN ? AND ? ORDER BY tarih')
    .all(req.user.sube_id, gunler[0], gunler[6])
    .map((v) => ({ ...v, sure: v.tip === 'calisma' ? sureSaat(v.baslangic, v.bitis) : 0 }));
  const toplamlar = {};
  for (const v of vardiyalar) toplamlar[v.kullanici_id] = Math.round(((toplamlar[v.kullanici_id] || 0) + v.sure) * 100) / 100;
  res.json({ hafta: pazartesi, gunler, personel, vardiyalar, toplam_saat: toplamlar });
});

// Bugun kimler calisiyor (ana sayfa / bildirim merkezi icin)
router.get('/bugun', (req, res) => {
  const bugun = yerelSimdi().toISOString().slice(0, 10);
  res.json(
    db
      .prepare(
        `SELECT v.*, k.ad_soyad FROM vardiyalar v JOIN kullanicilar k ON k.id = v.kullanici_id
         WHERE v.sube_id = ? AND v.tarih = ? ORDER BY v.tip, v.baslangic`
      )
      .all(req.user.sube_id, bugun)
  );
});

router.put('/', requireRole('admin', 'eczaci'), (req, res) => {
  const { kullanici_id, tarih, baslangic, bitis, notlar } = req.body;
  const tip = req.body.tip || 'calisma';
  const kisi = db.prepare('SELECT id FROM kullanicilar WHERE id = ? AND sube_id = ?').get(kullanici_id, req.user.sube_id);
  if (!kisi) return res.status(404).json({ error: 'Personel bu şubede bulunamadı' });
  if (!TARIH.test(String(tarih))) return res.status(400).json({ error: 'Tarih geçersiz' });
  if (!['calisma', 'izin', 'rapor'].includes(tip)) return res.status(400).json({ error: 'Geçersiz vardiya tipi' });
  if (tip === 'calisma' && (!SAAT.test(String(baslangic)) || !SAAT.test(String(bitis)))) {
    return res.status(400).json({ error: 'Çalışma için başlangıç ve bitiş saati SS:DD olmalı' });
  }
  db.prepare(
    `INSERT INTO vardiyalar (sube_id, kullanici_id, tarih, tip, baslangic, bitis, notlar) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kullanici_id, tarih) DO UPDATE SET tip = excluded.tip, baslangic = excluded.baslangic,
       bitis = excluded.bitis, notlar = excluded.notlar, sube_id = excluded.sube_id`
  ).run(req.user.sube_id, kisi.id, tarih, tip, tip === 'calisma' ? baslangic : null, tip === 'calisma' ? bitis : null, notlar || null);
  const v = db.prepare('SELECT * FROM vardiyalar WHERE kullanici_id = ? AND tarih = ?').get(kisi.id, tarih);
  res.json({ ...v, sure: v.tip === 'calisma' ? sureSaat(v.baslangic, v.bitis) : 0 });
});

router.delete('/', requireRole('admin', 'eczaci'), (req, res) => {
  const info = db
    .prepare('DELETE FROM vardiyalar WHERE kullanici_id = ? AND tarih = ? AND sube_id = ?')
    .run(Number(req.query.kullanici_id), String(req.query.tarih), req.user.sube_id);
  if (!info.changes) return res.status(404).json({ error: 'Vardiya bulunamadı' });
  res.status(204).end();
});

// Bir haftanin cizelgesini baska haftaya kopyalar; hedefte dolu gunlere dokunmaz
router.post('/kopyala', requireRole('admin', 'eczaci'), (req, res) => {
  if (!TARIH.test(String(req.body.kaynak_hafta)) || !TARIH.test(String(req.body.hedef_hafta))) {
    return res.status(400).json({ error: 'Hafta tarihleri geçersiz' });
  }
  const kaynak = haftaBasi(req.body.kaynak_hafta);
  const hedef = haftaBasi(req.body.hedef_hafta);
  if (kaynak === hedef) return res.status(400).json({ error: 'Kaynak ve hedef hafta aynı' });
  const kayitlar = db
    .prepare('SELECT * FROM vardiyalar WHERE sube_id = ? AND tarih BETWEEN ? AND ?')
    .all(req.user.sube_id, kaynak, gunEkle(kaynak, 6));
  const ekle = db.prepare(
    `INSERT OR IGNORE INTO vardiyalar (sube_id, kullanici_id, tarih, tip, baslangic, bitis, notlar) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const fark = Math.round((new Date(hedef) - new Date(kaynak)) / 86400000);
  let eklenen = 0;
  for (const v of kayitlar) {
    eklenen += ekle.run(req.user.sube_id, v.kullanici_id, gunEkle(v.tarih, fark), v.tip, v.baslangic, v.bitis, v.notlar).changes;
  }
  res.json({ eklenen, atlanan: kayitlar.length - eklenen });
});

router.get('/notlar', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT n.*, k.ad_soyad FROM vardiya_notlari n LEFT JOIN kullanicilar k ON k.id = n.kullanici_id
         WHERE n.sube_id = ? ORDER BY n.tamamlandi, n.id DESC LIMIT 50`
      )
      .all(req.user.sube_id)
  );
});

router.post('/notlar', (req, res) => {
  const metin = String(req.body.metin || '').trim();
  if (!metin) return res.status(400).json({ error: 'Not boş olamaz' });
  const info = db
    .prepare('INSERT INTO vardiya_notlari (sube_id, kullanici_id, metin) VALUES (?, ?, ?)')
    .run(req.user.sube_id, req.user.id, metin.slice(0, 1000));
  res.status(201).json(db.prepare('SELECT * FROM vardiya_notlari WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/notlar/:id', (req, res) => {
  const info = db
    .prepare('UPDATE vardiya_notlari SET tamamlandi = ? WHERE id = ? AND sube_id = ?')
    .run(req.body.tamamlandi ? 1 : 0, req.params.id, req.user.sube_id);
  if (!info.changes) return res.status(404).json({ error: 'Not bulunamadı' });
  res.json(db.prepare('SELECT * FROM vardiya_notlari WHERE id = ?').get(req.params.id));
});

module.exports = router;
module.exports.sureSaat = sureSaat;
