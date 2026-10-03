const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');

const { requireLogin, requireRole } = require('./auth');
const { db, ayarOku, ayarYaz } = require('./db');
const SqliteOturumDeposu = require('./oturumDeposu');
const { partileriEsitle } = require('./partiler');
const { islemKaydiMiddleware } = require('./islemKaydi');
const authRoutes = require('./routes/auth');
const ilaclarRoutes = require('./routes/ilaclar');
const satislarRoutes = require('./routes/satislar');
const musterilerRoutes = require('./routes/musteriler');
const tedarikcilerRoutes = require('./routes/tedarikciler');
const raporlarRoutes = require('./routes/raporlar');
const kullanicilarRoutes = require('./routes/kullanicilar');
const subelerRoutes = require('./routes/subeler');
const bildirimlerRoutes = require('./routes/bildirimler');
const yedeklemeRoutes = require('./routes/yedekleme');
const kasaKapanislariRoutes = require('./routes/kasaKapanislari');
const giderlerRoutes = require('./routes/giderler');
const siparislerRoutes = require('./routes/siparisler');
const gorevlerRoutes = require('./routes/gorevler');
const nobetlerRoutes = require('./routes/nobetler');
const islemKayitlariRoutes = require('./routes/islemKayitlari');
const kampanyalarRoutes = require('./routes/kampanyalar');
const veresiyeRoutes = require('./routes/veresiye');
const iadelerRoutes = require('./routes/iadeler');

// Parti kayitlari ile toplam stoklari baslangicta esitle (eski veritabanlari icin)
partileriEsitle();

const app = express();

// SESSION_SECRET verilmemisse uretilen anahtar DB'de saklanir; boylece
// sunucu yeniden basladiginda acik oturumlar gecersiz olmaz.
function oturumAnahtari() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let anahtar = ayarOku('session_secret');
  if (!anahtar) {
    anahtar = crypto.randomBytes(32).toString('hex');
    ayarYaz('session_secret', anahtar);
  }
  return anahtar;
}

app.set('trust proxy', process.env.TRUST_PROXY === '1');
app.use(express.json({ limit: '10mb' }));
app.use(
  session({
    name: 'eczanem.sid',
    secret: oturumAnahtari(),
    store: new SqliteOturumDeposu(db),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === '1',
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use('/api', islemKaydiMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/ilaclar', requireLogin, ilaclarRoutes);
app.use('/api/satislar', requireLogin, satislarRoutes);
app.use('/api/musteriler', requireLogin, musterilerRoutes);
app.use('/api/tedarikciler', requireLogin, tedarikcilerRoutes);
app.use('/api/raporlar', requireLogin, requireRole('admin', 'eczaci'), raporlarRoutes);
app.use('/api/kullanicilar', requireLogin, requireRole('admin'), kullanicilarRoutes);
app.use('/api/subeler', requireLogin, subelerRoutes);
app.use('/api/bildirimler', requireLogin, bildirimlerRoutes);
app.use('/api/yedekleme', requireLogin, requireRole('admin'), yedeklemeRoutes);
app.use('/api/kasa-kapanislari', requireLogin, kasaKapanislariRoutes);
app.use('/api/giderler', requireLogin, requireRole('admin', 'eczaci'), giderlerRoutes);
app.use('/api/kampanyalar', requireLogin, kampanyalarRoutes);
app.use('/api/veresiye', requireLogin, veresiyeRoutes);
app.use('/api/iadeler', requireLogin, requireRole('admin', 'eczaci'), iadelerRoutes);
app.use('/api/siparisler', requireLogin, requireRole('admin', 'eczaci'), siparislerRoutes);
app.use('/api/gorevler', requireLogin, gorevlerRoutes);
app.use('/api/nobetler', requireLogin, nobetlerRoutes);
app.use('/api/islem-kayitlari', requireLogin, requireRole('admin'), islemKayitlariRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', requireLogin, (req, res) => {
  res.status(404).json({ error: 'Bulunamadi' });
});

module.exports = app;
