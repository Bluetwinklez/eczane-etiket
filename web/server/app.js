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
const kaliteRoutes = require('./routes/kalite');
const ayarlarRoutes = require('./routes/ayarlar');
const sistemRoutes = require('./routes/sistem');
const mobilRoutes = require('./routes/mobil');
const onerilerRoutes = require('./routes/oneriler');
const kullanicilarRoutes = require('./routes/kullanicilar');
const subelerRoutes = require('./routes/subeler');
const bildirimlerRoutes = require('./routes/bildirimler');
const yedeklemeRoutes = require('./routes/yedekleme');
const kasaKapanislariRoutes = require('./routes/kasaKapanislari');
const giderlerRoutes = require('./routes/giderler');
const muhasebeRoutes = require('./routes/muhasebe');
const itsRoutes = require('./routes/its');
const siparislerRoutes = require('./routes/siparisler');
const gorevlerRoutes = require('./routes/gorevler');
const nobetlerRoutes = require('./routes/nobetler');
const islemKayitlariRoutes = require('./routes/islemKayitlari');
const kampanyalarRoutes = require('./routes/kampanyalar');
const veresiyeRoutes = require('./routes/veresiye');
const iadelerRoutes = require('./routes/iadeler');
const etkilesimlerRoutes = require('./routes/etkilesimler');
const hatirlatmalarRoutes = require('./routes/hatirlatmalar');
const sayimlarRoutes = require('./routes/sayimlar');
const transferlerRoutes = require('./routes/transferler');
const malKabulRoutes = require('./routes/malKabul');
const isteklerRoutes = require('./routes/istekler');
const emanetlerRoutes = require('./routes/emanetler');
const hedeflerRoutes = require('./routes/hedefler');
const vardiyalarRoutes = require('./routes/vardiyalar');
const bildirimMerkeziRoutes = require('./routes/bildirimMerkezi');

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
app.use('/api/its', requireLogin, requireRole('admin', 'eczaci'), itsRoutes);
app.use('/api/muhasebe', requireLogin, requireRole('admin', 'eczaci'), muhasebeRoutes);
app.use('/api/kampanyalar', requireLogin, kampanyalarRoutes);
app.use('/api/veresiye', requireLogin, veresiyeRoutes);
app.use('/api/iadeler', requireLogin, requireRole('admin', 'eczaci'), iadelerRoutes);
app.use('/api/etkilesimler', requireLogin, etkilesimlerRoutes);
app.use('/api/hatirlatmalar', requireLogin, hatirlatmalarRoutes);
app.use('/api/sayimlar', requireLogin, requireRole('admin', 'eczaci'), sayimlarRoutes);
app.use('/api/transferler', requireLogin, requireRole('admin', 'eczaci'), transferlerRoutes);
app.use('/api/mal-kabul', requireLogin, requireRole('admin', 'eczaci'), malKabulRoutes);
app.use('/api/istekler', requireLogin, isteklerRoutes);
app.use('/api/emanetler', requireLogin, requireRole('admin', 'eczaci'), emanetlerRoutes);
app.use('/api/hedefler', requireLogin, hedeflerRoutes);
app.use('/api/vardiyalar', requireLogin, vardiyalarRoutes);
app.use('/api/bildirim-merkezi', requireLogin, bildirimMerkeziRoutes);
app.use('/api/siparisler', requireLogin, requireRole('admin', 'eczaci'), siparislerRoutes);
app.use('/api/gorevler', requireLogin, gorevlerRoutes);
app.use('/api/nobetler', requireLogin, nobetlerRoutes);
app.use('/api/islem-kayitlari', requireLogin, requireRole('admin'), islemKayitlariRoutes);

app.use('/api/kalite', requireLogin, kaliteRoutes);
app.use('/api/ayarlar', requireLogin, ayarlarRoutes);
app.use('/api/sistem', requireLogin, sistemRoutes);
app.use('/api/mobil', requireLogin, mobilRoutes);
app.use('/api/oneriler', requireLogin, onerilerRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Gizlilik politikasi (App Store zorunlu): iletisim e-postasi ECZANEM_GIZLILIK_EPOSTA ile verilir
app.get('/gizlilik.html', (req, res) => {
  const fs = require('fs');
  const sablon = fs.readFileSync(path.join(__dirname, 'sablonlar', 'gizlilik.html'), 'utf8');
  const eposta = String(process.env.ECZANEM_GIZLILIK_EPOSTA || '').trim();
  const iletisim = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(eposta)
    ? `Gizlilikle ilgili sorularınız için: <a href="mailto:${eposta}">${eposta}</a>. Eczane içi konular (hesap, müşteri verisi) için eczane yöneticinize başvurabilirsiniz.`
    : 'Gizlilikle ilgili sorularınız ve veri taleplerinizle ilgili olarak eczane yöneticinize başvurun.';
  res.type('html').send(sablon.replace('{{GUNCELLEME}}', '4 Ekim 2026').replace('{{ILETISIM}}', iletisim));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', requireLogin, (req, res) => {
  res.status(404).json({ error: 'Bulunamadı' });
});

module.exports = app;
