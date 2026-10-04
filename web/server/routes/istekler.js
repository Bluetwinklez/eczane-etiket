const express = require('express');
const { db } = require('../db');
const { bildirimGonder } = require('../bildirim');

const router = express.Router();
const DURUMLAR = ['bekliyor', 'haber_verildi', 'teslim_edildi', 'iptal'];

function istekGetir(id, subeId) {
  return db
    .prepare(
      `SELECT ist.*, COALESCE(s.stok, 0) AS stok, m.ad_soyad AS kayitli_musteri, m.telefon AS musteri_telefon, m.email AS musteri_email,
              u.ad_soyad AS kaydeden
       FROM istekler ist
       LEFT JOIN ilac_stok s ON s.ilac_id = ist.ilac_id AND s.sube_id = ist.sube_id
       LEFT JOIN musteriler m ON m.id = ist.musteri_id
       LEFT JOIN kullanicilar u ON u.id = ist.kullanici_id
       WHERE ist.id = ? AND ist.sube_id = ?`
    )
    .get(id, subeId);
}

// stokta_var: bekleyen istekteki urun artik stokta (haber verilebilir)
router.get('/', (req, res) => {
  const durum = req.query.durum;
  let sql = `
    SELECT ist.*, COALESCE(s.stok, 0) AS stok, m.ad_soyad AS kayitli_musteri, u.ad_soyad AS kaydeden
    FROM istekler ist
    LEFT JOIN ilac_stok s ON s.ilac_id = ist.ilac_id AND s.sube_id = ist.sube_id
    LEFT JOIN musteriler m ON m.id = ist.musteri_id
    LEFT JOIN kullanicilar u ON u.id = ist.kullanici_id
    WHERE ist.sube_id = ?`;
  const params = [req.user.sube_id];
  if (durum === 'acik') sql += " AND ist.durum IN ('bekliyor', 'haber_verildi')";
  else if (DURUMLAR.includes(durum)) {
    sql += ' AND ist.durum = ?';
    params.push(durum);
  }
  sql += ' ORDER BY ist.id DESC LIMIT 500';
  res.json(
    db
      .prepare(sql)
      .all(...params)
      .map((r) => ({ ...r, stokta_var: Boolean(r.ilac_id) && r.stok >= r.adet && r.durum === 'bekliyor' }))
  );
});

router.post('/', (req, res) => {
  const { musteri_id, musteri_adi, telefon, ilac_id, urun_adi, notlar } = req.body;
  const adet = Number(req.body.adet || 1);
  if (!Number.isInteger(adet) || adet < 1) return res.status(400).json({ error: 'Adet geçersiz' });
  let ilac = null;
  if (ilac_id) {
    ilac = db.prepare('SELECT id, ad FROM ilaclar WHERE id = ?').get(ilac_id);
    if (!ilac) return res.status(404).json({ error: 'Ürün bulunamadı' });
  }
  const ad = ilac ? ilac.ad : String(urun_adi || '').trim();
  if (!ad) return res.status(400).json({ error: 'Ürün seçin veya ürün adı yazın' });
  let musteri = null;
  if (musteri_id) {
    musteri = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(musteri_id);
    if (!musteri) return res.status(404).json({ error: 'Müşteri bulunamadı' });
  }
  if (!musteri && !String(musteri_adi || '').trim()) return res.status(400).json({ error: 'Müşteri seçin veya adını yazın' });

  const info = db
    .prepare(
      `INSERT INTO istekler (sube_id, musteri_id, musteri_adi, telefon, ilac_id, urun_adi, adet, notlar, kullanici_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.sube_id,
      musteri ? musteri.id : null,
      musteri ? musteri.ad_soyad : String(musteri_adi).trim(),
      telefon || (musteri && musteri.telefon) || null,
      ilac ? ilac.id : null,
      ad,
      adet,
      notlar || null,
      req.user.id
    );
  res.status(201).json(istekGetir(info.lastInsertRowid, req.user.sube_id));
});

router.put('/:id/durum', (req, res) => {
  const ist = istekGetir(req.params.id, req.user.sube_id);
  if (!ist) return res.status(404).json({ error: 'İstek bulunamadı' });
  if (!DURUMLAR.includes(req.body.durum)) return res.status(400).json({ error: 'Geçersiz durum' });
  db.prepare("UPDATE istekler SET durum = ?, guncelleme = datetime('now') WHERE id = ?").run(req.body.durum, ist.id);
  res.json(istekGetir(ist.id, req.user.sube_id));
});

// Urun geldi haberi: kayitli musteriye SMS/e-posta (SMS saglayici yoksa simule edilir)
router.post('/:id/haber-ver', async (req, res) => {
  const ist = istekGetir(req.params.id, req.user.sube_id);
  if (!ist) return res.status(404).json({ error: 'İstek bulunamadı' });
  if (!ist.musteri_id) return res.status(400).json({ error: 'Kayıtlı müşteri değil; telefonla arayıp durumu elle güncelleyin' });
  const kanal = req.body.kanal || 'sms';
  if (!['sms', 'email'].includes(kanal)) return res.status(400).json({ error: 'Kanal sms veya email olmalı' });
  if (kanal === 'sms' && !ist.musteri_telefon) return res.status(400).json({ error: 'Müşterinin telefonu yok' });
  if (kanal === 'email' && !ist.musteri_email) return res.status(400).json({ error: 'Müşterinin e-postası yok' });

  const sube = db.prepare('SELECT ad FROM subeler WHERE id = ?').get(req.user.sube_id);
  const musteri = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(ist.musteri_id);
  const mesaj = `Sayin ${musteri.ad_soyad}, istediginiz ${ist.urun_adi} eczanemize gelmistir. Uygun oldugunuzda alabilirsiniz. - ${sube ? sube.ad : ''}`;
  const bildirim = await bildirimGonder(musteri, kanal, mesaj);
  db.prepare("UPDATE istekler SET durum = 'haber_verildi', guncelleme = datetime('now') WHERE id = ?").run(ist.id);
  res.json({ bildirim, istek: istekGetir(ist.id, req.user.sube_id) });
});

module.exports = router;
