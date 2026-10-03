const { db } = require('./db');

// Veri degistiren her API istegini (POST/PUT/DELETE) "kim, neyi, ne zaman,
// sonuc ne oldu" olarak kaydeder. Basarisiz istekler de kaydedilir;
// yetkisiz deneme izlerini gormek icin onemlidir.
const DEGISTIREN_YONTEMLER = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const GIZLI_ALANLAR = new Set(['sifre', 'mevcut_sifre', 'yeni_sifre', 'sifre_hash', 'sifre_salt']);
const MAKS_DETAY = 1000;

function detayOzetle(yol, body) {
  if (!body || typeof body !== 'object') return null;
  // Yedek geri yukleme govdesi tum veritabanini icerir; sadece ozet tutulur.
  if (yol.startsWith('/api/yedekleme/import')) {
    const tablolar = body.tablolar && typeof body.tablolar === 'object' ? body.tablolar : {};
    return JSON.stringify({
      tablolar: Object.fromEntries(Object.entries(tablolar).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]))
    });
  }
  const temiz = {};
  for (const [k, v] of Object.entries(body)) {
    temiz[k] = GIZLI_ALANLAR.has(k) ? '***' : v;
  }
  const metin = JSON.stringify(temiz);
  return metin.length > MAKS_DETAY ? metin.slice(0, MAKS_DETAY) + '…' : metin;
}

function kaynakVeKayit(yol) {
  // /api/ilaclar/5/stok -> kaynak: ilaclar, kayit_id: 5
  const parcalar = yol.split('?')[0].split('/').filter(Boolean);
  const kaynak = parcalar[1] || null;
  const kayitId = parcalar[2] && /^\d+$/.test(parcalar[2]) ? parcalar[2] : null;
  return { kaynak, kayitId };
}

const insert = db.prepare(
  `INSERT INTO islem_kayitlari
   (kullanici_id, kullanici_adi, sube_id, yontem, yol, kaynak, kayit_id, durum_kodu, detay, ip)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const kullaniciBul = db.prepare('SELECT id, kullanici_adi, sube_id FROM kullanicilar WHERE id = ?');

function islemKaydiMiddleware(req, res, next) {
  if (!DEGISTIREN_YONTEMLER.has(req.method)) return next();

  const yol = req.originalUrl;
  // Detay, route govdeyi degistirmeden once alinir.
  const detay = detayOzetle(yol, req.body);
  const girisDenemesiKullanici = yol.startsWith('/api/auth/login') && req.body ? req.body.kullanici_adi : null;
  // Cikis istegi oturumu yok eder; kullaniciyi istek basinda yakala.
  const baslangicKullaniciId = req.session ? req.session.userId : null;

  res.on('finish', () => {
    try {
      let kullanici = req.user || null;
      const oturumKullaniciId = (req.session && req.session.userId) || baslangicKullaniciId;
      if (!kullanici && oturumKullaniciId) kullanici = kullaniciBul.get(oturumKullaniciId) || null;
      const { kaynak, kayitId } = kaynakVeKayit(yol);
      insert.run(
        kullanici ? kullanici.id : null,
        kullanici ? kullanici.kullanici_adi : girisDenemesiKullanici || null,
        kullanici ? kullanici.sube_id : null,
        req.method,
        yol.split('?')[0],
        kaynak,
        kayitId,
        res.statusCode,
        detay,
        req.ip
      );
    } catch (err) {
      // Kayit hatasi asil istegi etkilememeli
      console.error('Islem kaydi yazilamadi:', err.message);
    }
  });

  next();
}

module.exports = { islemKaydiMiddleware, detayOzetle, kaynakVeKayit };
