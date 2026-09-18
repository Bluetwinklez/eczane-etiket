const { db, verifyPassword } = require('./db');

function findUserByUsername(kullaniciAdi) {
  return db.prepare('SELECT * FROM kullanicilar WHERE kullanici_adi = ?').get(kullaniciAdi);
}

function findUserById(id) {
  return db.prepare('SELECT * FROM kullanicilar WHERE id = ?').get(id);
}

function toPublicUser(user) {
  if (!user) return null;
  const { sifre_hash, sifre_salt, ...rest } = user;
  return rest;
}

function login(kullaniciAdi, sifre) {
  const user = findUserByUsername(kullaniciAdi);
  if (!user || !user.aktif) return null;
  if (!verifyPassword(sifre, user.sifre_salt, user.sifre_hash)) return null;
  return user;
}

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Oturum acmaniz gerekiyor' });
  }
  const user = findUserById(req.session.userId);
  if (!user || !user.aktif) {
    return res.status(401).json({ error: 'Oturum gecersiz' });
  }
  req.user = user;
  next();
}

function requireRole(...roller) {
  return (req, res, next) => {
    if (!req.user || !roller.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Bu islem icin yetkiniz yok' });
    }
    next();
  };
}

module.exports = { findUserByUsername, findUserById, toPublicUser, login, requireLogin, requireRole };
