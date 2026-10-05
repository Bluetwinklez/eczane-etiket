// Hasta takibi: raporlu ilaclar (bitis uyarisi) ve musteri olcumleri
const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { TIPLER, degerlendir } = require('../takip');
const { yerelSimdi } = require('../zaman');

const router = express.Router();
const yonetici = requireRole('admin', 'eczaci');
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const bugun = () => yerelSimdi().toISOString().slice(0, 10);
const gunEkle = (t, n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
// Takvimde gercekten var olan gun mu? ("2026-13-01", "2026-02-30" reddedilir)
function tarihGecerli(t) {
  if (!TARIH.test(t)) return false;
  const d = new Date(t + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}
const metin = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);

// ---- Raporlar ----
function raporDurumu(r, b = bugun()) {
  const kalan = Math.round((Date.parse(r.bitis + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
  return { kalan_gun: kalan, durum: kalan < 0 ? 'bitti' : kalan <= 30 ? 'yaklasan' : 'aktif' };
}

router.get('/raporlar', (req, res) => {
  let sql = `SELECT r.*, m.ad_soyad AS musteri_adi, m.telefon FROM hasta_raporlari r JOIN musteriler m ON m.id = r.musteri_id WHERE (r.sube_id = ? OR r.sube_id IS NULL)`;
  const p = [req.user.sube_id];
  if (req.query.musteri_id) {
    sql += ' AND r.musteri_id = ?';
    p.push(Number(req.query.musteri_id));
  }
  sql += ' ORDER BY r.bitis';
  let liste = db.prepare(sql).all(...p).map((r) => ({ ...r, ...raporDurumu(r) }));
  if (req.query.durum) liste = liste.filter((r) => r.durum === req.query.durum);
  const sayim = { aktif: 0, yaklasan: 0, bitti: 0 };
  for (const r of liste) sayim[r.durum] += 1;
  res.json({ sayim, raporlar: liste });
});

function raporOku(b) {
  const r = {
    rapor_no: metin(b.rapor_no, 40),
    tani: metin(b.tani, 200),
    ilac: metin(b.ilac, 200),
    doktor: metin(b.doktor, 120),
    baslangic: b.baslangic || null,
    bitis: b.bitis,
    notlar: metin(b.notlar, 500)
  };
  if (!r.bitis || !tarihGecerli(r.bitis)) return { hata: 'Rapor bitiş tarihi zorunlu (YYYY-AA-GG)' };
  if (r.baslangic && !tarihGecerli(r.baslangic)) return { hata: 'Başlangıç tarihi geçersiz' };
  if (r.baslangic && r.baslangic > r.bitis) return { hata: 'Başlangıç bitişten sonra olamaz' };
  if (!r.tani && !r.ilac) return { hata: 'Tanı veya ilaç bilgisi girin' };
  return { r };
}

router.post('/raporlar', yonetici, (req, res) => {
  const m = db.prepare('SELECT id FROM musteriler WHERE id = ?').get(req.body.musteri_id);
  if (!m) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  const { r, hata } = raporOku(req.body);
  if (hata) return res.status(400).json({ error: hata });
  const info = db
    .prepare(
      `INSERT INTO hasta_raporlari (musteri_id, sube_id, rapor_no, tani, ilac, doktor, baslangic, bitis, notlar, kullanici_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(m.id, req.user.sube_id, r.rapor_no, r.tani, r.ilac, r.doktor, r.baslangic, r.bitis, r.notlar, req.user.id);
  const kayit = db.prepare('SELECT * FROM hasta_raporlari WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...kayit, ...raporDurumu(kayit) });
});

router.put('/raporlar/:id', yonetici, (req, res) => {
  const mevcut = db.prepare('SELECT * FROM hasta_raporlari WHERE id = ?').get(req.params.id);
  if (!mevcut) return res.status(404).json({ error: 'Rapor bulunamadı' });
  const { r, hata } = raporOku({ ...mevcut, ...req.body });
  if (hata) return res.status(400).json({ error: hata });
  db.prepare('UPDATE hasta_raporlari SET rapor_no=?, tani=?, ilac=?, doktor=?, baslangic=?, bitis=?, notlar=? WHERE id=?').run(
    r.rapor_no, r.tani, r.ilac, r.doktor, r.baslangic, r.bitis, r.notlar, mevcut.id
  );
  const kayit = db.prepare('SELECT * FROM hasta_raporlari WHERE id = ?').get(mevcut.id);
  res.json({ ...kayit, ...raporDurumu(kayit) });
});

router.delete('/raporlar/:id', yonetici, (req, res) => {
  const info = db.prepare('DELETE FROM hasta_raporlari WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Rapor bulunamadı' });
  res.status(204).end();
});

// ---- Olcumler ----
router.get('/olcum-tipleri', (req, res) => res.json(TIPLER));

router.get('/olcumler', (req, res) => {
  const musteriId = Number(req.query.musteri_id);
  if (!musteriId) return res.status(400).json({ error: 'Müşteri seçin' });
  let sql = 'SELECT o.*, k.ad_soyad AS olcen FROM musteri_olcumleri o LEFT JOIN kullanicilar k ON k.id = o.kullanici_id WHERE o.musteri_id = ?';
  const p = [musteriId];
  if (req.query.tip) {
    sql += ' AND o.tip = ?';
    p.push(req.query.tip);
  }
  sql += ' ORDER BY o.tarih DESC, o.id DESC LIMIT 500';
  const liste = db.prepare(sql).all(...p).map((o) => ({ ...o, degerlendirme: degerlendir(o) }));
  // Her tip icin son olcum ozeti
  const son = {};
  for (const o of liste) if (!son[o.tip]) son[o.tip] = o;
  res.json({ son, olcumler: liste });
});

router.post('/olcumler', (req, res) => {
  const b = req.body || {};
  const tip = TIPLER[b.tip];
  if (!tip) return res.status(400).json({ error: 'Geçersiz ölçüm tipi' });
  if (!db.prepare('SELECT id FROM musteriler WHERE id = ?').get(b.musteri_id)) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  const d1 = Number(String(b.deger1 ?? '').replace(',', '.'));
  const d2 = tip.iki ? Number(String(b.deger2 ?? '').replace(',', '.')) : null;
  const [a1, a2] = tip.aralik;
  if (!Number.isFinite(d1) || d1 < a1[0] || d1 > a1[1]) return res.status(400).json({ error: `${tip.ad} değeri ${a1[0]}-${a1[1]} arasında olmalı` });
  if (tip.iki && (!Number.isFinite(d2) || d2 < a2[0] || d2 > a2[1])) return res.status(400).json({ error: 'Küçük tansiyon değerini girin' });
  if (tip.iki && d2 >= d1) return res.status(400).json({ error: 'Büyük tansiyon küçük tansiyondan yüksek olmalı' });
  const aclik = b.tip === 'seker' ? (b.aclik === 'ac' ? 'ac' : 'tok') : null;
  let tarih = null;
  if (b.tarih) {
    const gecerli = /^\d{4}-\d{2}-\d{2}( ([01]\d|2[0-3]):[0-5]\d)?$/.test(b.tarih) && tarihGecerli(b.tarih.slice(0, 10));
    if (!gecerli) return res.status(400).json({ error: 'Tarih geçersiz' });
    tarih = b.tarih.length === 10 ? b.tarih + ' 12:00:00' : b.tarih + ':00';
  }
  const info = db
    .prepare(
      `INSERT INTO musteri_olcumleri (musteri_id, sube_id, tip, deger1, deger2, aclik, notlar, kullanici_id, tarih)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
    )
    .run(b.musteri_id, req.user.sube_id, b.tip, d1, d2, aclik, metin(b.notlar, 300), req.user.id, tarih);
  const o = db.prepare('SELECT * FROM musteri_olcumleri WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...o, degerlendirme: degerlendir(o) });
});

router.delete('/olcumler/:id', yonetici, (req, res) => {
  const info = db.prepare('DELETE FROM musteri_olcumleri WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Ölçüm bulunamadı' });
  res.status(204).end();
});

module.exports = router;
module.exports.raporBitisSayisi = (subeId, gun = 15) =>
  db.prepare('SELECT COUNT(*) AS c FROM hasta_raporlari WHERE (sube_id = ? OR sube_id IS NULL) AND bitis BETWEEN ? AND ?').get(subeId, bugun(), gunEkle(bugun(), gun)).c;
