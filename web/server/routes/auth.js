const express = require('express');
const { db, hashPassword, verifyPassword } = require('../db');
const { login, toPublicUser, requireOturum, sifreKuraliHatasi } = require('../auth');
const sinirlayici = require('../girisSinirlayici');
const { demoHesabiMi } = require('../demo');

const router = express.Router();

router.post('/login', (req, res) => {
  const { kullanici_adi, sifre } = req.body;
  if (!kullanici_adi || !sifre) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }

  const ip = req.ip;
  const kalanSaniye = sinirlayici.kilitliMi(ip, kullanici_adi);
  if (kalanSaniye > 0) {
    res.setHeader('Retry-After', String(kalanSaniye));
    return res.status(429).json({
      error: `Çok fazla başarısız deneme. ${Math.ceil(kalanSaniye / 60)} dakika sonra tekrar deneyin.`
    });
  }

  const user = login(kullanici_adi, sifre);
  if (!user) {
    sinirlayici.basarisizKaydet(ip, kullanici_adi);
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
  }

  sinirlayici.sifirla(ip, kullanici_adi);
  // Oturum sabitleme (session fixation) saldirisina karsi yeni oturum kimligi
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Oturum oluşturulamadı' });
    req.session.userId = user.id;
    res.json({ user: toPublicUser(user) });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('eczanem.sid');
    res.status(204).end();
  });
});

router.get('/me', requireOturum, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// Ekran kilidini acmak icin mevcut kullanicinin sifresi dogrulanir (oturum yenilenmez).
// Basarisiz denemeler giris sinirlayicisina sayilir; kilitlenen hesap icin istemci cikis yapar.
router.post('/kilit-ac', requireOturum, (req, res) => {
  const anahtar = 'kilit:' + req.user.kullanici_adi;
  const kalanSaniye = sinirlayici.kilitliMi(req.ip, anahtar);
  if (kalanSaniye > 0) return res.status(429).json({ error: 'Çok fazla hatalı deneme; yeniden giriş yapın.' });
  if (!req.body.sifre || !verifyPassword(String(req.body.sifre), req.user.sifre_salt, req.user.sifre_hash)) {
    sinirlayici.basarisizKaydet(req.ip, anahtar);
    return res.status(400).json({ error: 'Şifre hatalı' });
  }
  sinirlayici.sifirla(req.ip, anahtar);
  res.json({ ok: true });
});

router.post('/sifre-degistir', requireOturum, (req, res) => {
  if (demoHesabiMi(req.user)) return res.status(403).json({ error: 'Demo hesabının şifresi değiştirilemez' });
  const { mevcut_sifre, yeni_sifre } = req.body;
  if (!mevcut_sifre || !verifyPassword(mevcut_sifre, req.user.sifre_salt, req.user.sifre_hash)) {
    return res.status(400).json({ error: 'Mevcut şifre hatalı' });
  }
  const kuralHatasi = sifreKuraliHatasi(yeni_sifre);
  if (kuralHatasi) return res.status(400).json({ error: kuralHatasi });
  if (yeni_sifre === mevcut_sifre) {
    return res.status(400).json({ error: 'Yeni şifre mevcut şifreyle aynı olamaz' });
  }

  const { hash, salt } = hashPassword(yeni_sifre);
  db.prepare('UPDATE kullanicilar SET sifre_hash = ?, sifre_salt = ?, sifre_degistirilmeli = 0 WHERE id = ?').run(
    hash,
    salt,
    req.user.id
  );

  // Diger cihazlardaki oturumlari sonlandir; mevcut oturum acik kalir.
  if (req.sessionStore && typeof req.sessionStore.kullaniciOturumlariniSil === 'function') {
    req.sessionStore.kullaniciOturumlariniSil(req.user.id, req.sessionID);
  }

  const guncel = db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(req.user.id);
  res.json({ user: toPublicUser(guncel) });
});

module.exports = router;
