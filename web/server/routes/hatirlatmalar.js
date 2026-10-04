const express = require('express');
const { db } = require('../db');
const { bildirimGonder } = require('../bildirim');

const router = express.Router();

const GUN_MS = 24 * 60 * 60 * 1000;

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

function gunEkle(tarih, gun) {
  const d = new Date(tarih + 'T00:00:00Z');
  return new Date(d.getTime() + gun * GUN_MS).toISOString().slice(0, 10);
}

function bugun() {
  return new Date().toISOString().slice(0, 10);
}

// Kronik ilaclarin (kutu_gun tanimli) musteri bazinda tahmini bitis tarihleri.
// Son alim gununde alinan net kutu sayisi (iadeler dusulur) x kutu suresi kadar yeter.
function bitisTahminleri(subeId) {
  let sql = `
    SELECT sa.musteri_id, sk.ilac_id, MAX(date(sa.tarih)) AS son_alim
    FROM satis_kalemleri sk
    JOIN satislar sa ON sa.id = sk.satis_id
    JOIN ilaclar i ON i.id = sk.ilac_id
    WHERE sa.musteri_id IS NOT NULL AND i.kutu_gun > 0`;
  const params = [];
  if (subeId) {
    sql += ' AND sa.sube_id = ?';
    params.push(subeId);
  }
  sql += ' GROUP BY sa.musteri_id, sk.ilac_id';

  const netAdet = db.prepare(`
    SELECT COALESCE(SUM(sk.adet), 0)
           - COALESCE(SUM((SELECT COALESCE(SUM(ik.adet), 0) FROM iade_kalemleri ik WHERE ik.satis_kalem_id = sk.id)), 0) AS adet
    FROM satis_kalemleri sk
    JOIN satislar sa ON sa.id = sk.satis_id
    WHERE sa.musteri_id = ? AND sk.ilac_id = ? AND date(sa.tarih) = ?`);
  const detay = db.prepare(`
    SELECT m.ad_soyad, m.telefon, m.email, i.ad AS ilac_adi, i.kutu_gun
    FROM musteriler m, ilaclar i WHERE m.id = ? AND i.id = ?`);
  const hatirlatma = db.prepare(
    'SELECT tarih FROM ilac_hatirlatmalari WHERE musteri_id = ? AND ilac_id = ? AND bitis_tarihi = ?'
  );

  const bugunMs = new Date(bugun() + 'T00:00:00Z').getTime();
  const sonuc = [];
  for (const r of db.prepare(sql).all(...params)) {
    const adet = netAdet.get(r.musteri_id, r.ilac_id, r.son_alim).adet;
    if (adet <= 0) continue;
    const d = detay.get(r.musteri_id, r.ilac_id);
    const bitis = gunEkle(r.son_alim, adet * d.kutu_gun);
    const kalanGun = Math.round((new Date(bitis + 'T00:00:00Z').getTime() - bugunMs) / GUN_MS);
    const h = hatirlatma.get(r.musteri_id, r.ilac_id, bitis);
    sonuc.push({
      musteri_id: r.musteri_id,
      ad_soyad: d.ad_soyad,
      telefon: d.telefon,
      email: d.email,
      ilac_id: r.ilac_id,
      ilac_adi: d.ilac_adi,
      son_alim: r.son_alim,
      adet,
      kutu_gun: d.kutu_gun,
      bitis_tarihi: bitis,
      kalan_gun: kalanGun,
      hatirlatildi: h ? h.tarih : null
    });
  }
  return sonuc.sort((a, b) => a.kalan_gun - b.kalan_gun);
}

// Onumuzdeki `gun` gun icinde bitecek veya en fazla 30 gun once bitmis ilaclar
// (daha eskisi muhtemelen baska yerden alinmistir, listeyi kalabaliklastirmaz).
router.get('/ilac-bitis', (req, res) => {
  const gun = Math.min(90, Math.max(0, Number(req.query.gun ?? 7) || 0));
  const subeId = resolveSubeId(req, req.query.sube_id);
  res.json(bitisTahminleri(subeId).filter((r) => r.kalan_gun <= gun && r.kalan_gun >= -30));
});

function varsayilanMesaj(kayit, eczaneAdi) {
  const ne_zaman = kayit.kalan_gun < 0 ? `${kayit.bitis_tarihi} tarihinde bitmis olmali` : `${kayit.bitis_tarihi} tarihinde bitecek`;
  return `Sayin ${kayit.ad_soyad}, ${kayit.ilac_adi} ilaciniz ${ne_zaman}. Receteniz varsa yenilemeyi unutmayin. Saglikli gunler dileriz - ${eczaneAdi}`;
}

router.post('/ilac-bitis/gonder', async (req, res) => {
  const musteriId = Number(req.body.musteri_id);
  const ilacId = Number(req.body.ilac_id);
  const kanal = req.body.kanal || 'sms';
  if (!['sms', 'email'].includes(kanal)) return res.status(400).json({ error: 'Kanal sms veya email olmalı' });

  const kayit = bitisTahminleri(resolveSubeId(req, req.body.sube_id)).find(
    (r) => r.musteri_id === musteriId && r.ilac_id === ilacId
  );
  if (!kayit) return res.status(404).json({ error: 'Bu müşteri için takip edilen ilaç bulunamadı' });
  if (kayit.hatirlatildi) {
    return res.status(409).json({ error: `Bu dönem için zaten hatırlatıldı (${kayit.hatirlatildi})` });
  }
  if (kanal === 'sms' && !kayit.telefon) return res.status(400).json({ error: 'Müşterinin telefon numarası yok' });
  if (kanal === 'email' && !kayit.email) return res.status(400).json({ error: 'Müşterinin e-posta adresi yok' });

  const sube = db.prepare('SELECT ad FROM subeler WHERE id = ?').get(req.user.sube_id);
  const mesaj = (req.body.mesaj && String(req.body.mesaj).trim()) || varsayilanMesaj(kayit, sube ? sube.ad : 'Eczaneniz');
  const musteri = db.prepare('SELECT * FROM musteriler WHERE id = ?').get(musteriId);

  // Once donemi isaretle: ayni anda iki kez basilirsa ikinci istek UNIQUE ile reddedilir
  let isaretId;
  try {
    isaretId = db
      .prepare('INSERT INTO ilac_hatirlatmalari (musteri_id, ilac_id, bitis_tarihi, kullanici_id) VALUES (?, ?, ?, ?)')
      .run(musteriId, ilacId, kayit.bitis_tarihi, req.user.id).lastInsertRowid;
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu dönem için zaten hatırlatıldı' });
    throw err;
  }
  const bildirim = await bildirimGonder(musteri, kanal, mesaj);
  db.prepare('UPDATE ilac_hatirlatmalari SET bildirim_id = ? WHERE id = ?').run(bildirim.id, isaretId);
  res.status(201).json({ bildirim, bitis_tarihi: kayit.bitis_tarihi });
});

module.exports = router;
module.exports.bitisTahminleri = bitisTahminleri;
