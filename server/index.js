const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');

const { requireLogin } = require('./auth');
const authRoutes = require('./routes/auth');
const ilaclarRoutes = require('./routes/ilaclar');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    name: 'eczanem.sid',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/ilaclar', requireLogin, ilaclarRoutes);

// Diger API route'lari (satislar, musteriler, vb.) ilerleyen commit'lerde eklenecek.
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', requireLogin, (req, res) => {
  res.status(404).json({ error: 'Bulunamadi' });
});

app.listen(PORT, () => {
  console.log(`Eczanem Programi ${PORT} portunda calisiyor`);
});
