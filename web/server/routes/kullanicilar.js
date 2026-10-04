const express = require('express');
const { db, hashPassword } = require('../db');
const { toPublicUser, sifreKuraliHatasi } = require('../auth');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM kullanicilar ORDER BY ad_soyad').all();
  res.json(rows.map(toPublicUser));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  res.json(toPublicUser(row));
});

router.post('/', (req, res) => {
  const { kullanici_adi, sifre, ad_soyad, rol, sube_id } = req.body;
  if (!kullanici_adi || !sifre || !ad_soyad || !rol) {
    return res.status(400).json({ error: 'Kullanıcı adı, şifre, ad soyad ve rol zorunludur' });
  }
  if (!['admin', 'eczaci', 'kasiyer'].includes(rol)) {
    return res.status(400).json({ error: 'Geçersiz rol' });
  }
  const kuralHatasi = sifreKuraliHatasi(sifre);
  if (kuralHatasi) return res.status(400).json({ error: kuralHatasi });

  try {
    const { hash, salt } = hashPassword(sifre);
    const info = db
      .prepare(
        `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, sifre_salt, ad_soyad, rol, sube_id, sifre_degistirilmeli)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      )
      .run(kullanici_adi.trim(), hash, salt, ad_soyad.trim(), rol, sube_id || null);
    const created = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(toPublicUser(created));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu kullanıcı adı zaten kayıtlı' });
    }
    res.status(500).json({ error: 'Kullanıcı oluşturulamadı' });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  const { ad_soyad, rol, sube_id, aktif, sifre } = req.body;
  if (!ad_soyad || !rol) return res.status(400).json({ error: 'Ad soyad ve rol zorunludur' });
  if (!['admin', 'eczaci', 'kasiyer'].includes(rol)) {
    return res.status(400).json({ error: 'Geçersiz rol' });
  }
  if (existing.id === req.user.id && aktif === false) {
    return res.status(400).json({ error: 'Kendi hesabınızı pasif hale getiremezsiniz' });
  }
  if (sifre) {
    const kuralHatasi = sifreKuraliHatasi(sifre);
    if (kuralHatasi) return res.status(400).json({ error: kuralHatasi });
  }

  db.prepare('UPDATE kullanicilar SET ad_soyad=?, rol=?, sube_id=?, aktif=? WHERE id=?').run(
    ad_soyad.trim(),
    rol,
    sube_id || null,
    aktif === false ? 0 : 1,
    req.params.id
  );

  if (sifre) {
    const { hash, salt } = hashPassword(sifre);
    // Yonetici tarafindan sifirlanan sifre ilk giriste kullanici tarafindan degistirilmeli
    db.prepare('UPDATE kullanicilar SET sifre_hash=?, sifre_salt=?, sifre_degistirilmeli=1 WHERE id=?').run(
      hash,
      salt,
      req.params.id
    );
  }

  const updated = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.params.id);
  res.json(toPublicUser(updated));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  if (existing.id === req.user.id) {
    return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
  }
  db.prepare('DELETE FROM kullanicilar WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
