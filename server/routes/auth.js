const express = require('express');
const { login, toPublicUser, requireLogin } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { kullanici_adi, sifre } = req.body;
  if (!kullanici_adi || !sifre) {
    return res.status(400).json({ error: 'Kullanici adi ve sifre gerekli' });
  }
  const user = login(kullanici_adi, sifre);
  if (!user) {
    return res.status(401).json({ error: 'Kullanici adi veya sifre hatali' });
  }
  req.session.userId = user.id;
  res.json({ user: toPublicUser(user) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

router.get('/me', requireLogin, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

module.exports = router;
