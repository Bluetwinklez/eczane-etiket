const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.join(__dirname, '..', 'data', 'eczane.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS subeler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT NOT NULL,
    adres TEXT,
    telefon TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kullanicilar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kullanici_adi TEXT NOT NULL UNIQUE,
    sifre_hash TEXT NOT NULL,
    sifre_salt TEXT NOT NULL,
    ad_soyad TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'eczaci', 'kasiyer')),
    sube_id INTEGER REFERENCES subeler(id) ON DELETE SET NULL,
    aktif INTEGER NOT NULL DEFAULT 1,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ilaclar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad TEXT NOT NULL,
    barkod TEXT UNIQUE,
    kategori TEXT,
    uretici TEXT,
    receteli INTEGER NOT NULL DEFAULT 0,
    kritik_stok INTEGER NOT NULL DEFAULT 10,
    alis_fiyati REAL NOT NULL DEFAULT 0,
    satis_fiyati REAL NOT NULL DEFAULT 0,
    skt TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ilac_stok (
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    sube_id INTEGER NOT NULL REFERENCES subeler(id) ON DELETE CASCADE,
    stok INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ilac_id, sube_id)
  );

  CREATE TABLE IF NOT EXISTS fiyat_gecmisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    eski_fiyat REAL NOT NULL,
    yeni_fiyat REAL NOT NULL,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stok_hareketleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id) ON DELETE CASCADE,
    sube_id INTEGER NOT NULL REFERENCES subeler(id) ON DELETE CASCADE,
    tip TEXT NOT NULL CHECK (tip IN ('giris', 'cikis')),
    adet INTEGER NOT NULL,
    aciklama TEXT,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS musteriler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_soyad TEXT NOT NULL,
    telefon TEXT,
    email TEXT,
    tc_no TEXT,
    adres TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tedarikciler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firma_adi TEXT NOT NULL,
    yetkili TEXT,
    telefon TEXT,
    email TEXT,
    olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS satislar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER REFERENCES musteriler(id) ON DELETE SET NULL,
    sube_id INTEGER NOT NULL REFERENCES subeler(id),
    kullanici_id INTEGER REFERENCES kullanicilar(id) ON DELETE SET NULL,
    toplam_tutar REAL NOT NULL DEFAULT 0,
    odeme_tipi TEXT NOT NULL DEFAULT 'nakit',
    sgk_recete INTEGER NOT NULL DEFAULT 0,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS satis_kalemleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    satis_id INTEGER NOT NULL REFERENCES satislar(id) ON DELETE CASCADE,
    ilac_id INTEGER NOT NULL REFERENCES ilaclar(id),
    ilac_adi TEXT NOT NULL,
    adet INTEGER NOT NULL,
    birim_fiyat REAL NOT NULL,
    alis_fiyati REAL NOT NULL DEFAULT 0,
    ara_toplam REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bildirimler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri_id INTEGER REFERENCES musteriler(id) ON DELETE CASCADE,
    kanal TEXT NOT NULL CHECK (kanal IN ('email', 'sms')),
    mesaj TEXT NOT NULL,
    durum TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'gonderildi', 'simule', 'hata')),
    hata_mesaji TEXT,
    tarih TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function hashPassword(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(plain, salt, hash) {
  const check = crypto.scryptSync(plain, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

function seedIfEmpty() {
  const subeCount = db.prepare('SELECT COUNT(*) AS c FROM subeler').get().c;
  if (subeCount === 0) {
    db.prepare('INSERT INTO subeler (ad, adres, telefon) VALUES (?, ?, ?)').run(
      'Merkez Eczane',
      'Ataturk Mah. Cumhuriyet Cad. No:1, Istanbul',
      '02121234567'
    );
    db.prepare('INSERT INTO subeler (ad, adres, telefon) VALUES (?, ?, ?)').run(
      'Kadikoy Subesi',
      'Bagdat Cad. No:45, Istanbul',
      '02167654321'
    );
  }

  const kullaniciCount = db.prepare('SELECT COUNT(*) AS c FROM kullanicilar').get().c;
  if (kullaniciCount === 0) {
    const merkezId = db.prepare('SELECT id FROM subeler ORDER BY id LIMIT 1').get().id;
    const admin = hashPassword('admin123');
    db.prepare(
      `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, sifre_salt, ad_soyad, rol, sube_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('admin', admin.hash, admin.salt, 'Sistem Yoneticisi', 'admin', merkezId);

    const eczaci = hashPassword('eczaci123');
    db.prepare(
      `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, sifre_salt, ad_soyad, rol, sube_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('eczaci', eczaci.hash, eczaci.salt, 'Eczaci Kullanici', 'eczaci', merkezId);

    const kasiyer = hashPassword('kasiyer123');
    db.prepare(
      `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, sifre_salt, ad_soyad, rol, sube_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('kasiyer', kasiyer.hash, kasiyer.salt, 'Kasiyer Kullanici', 'kasiyer', merkezId);
  }

  const ilacCount = db.prepare('SELECT COUNT(*) AS c FROM ilaclar').get().c;
  if (ilacCount === 0) {
    const subeler = db.prepare('SELECT id FROM subeler ORDER BY id').all();
    const insertIlac = db.prepare(`
      INSERT INTO ilaclar (ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertStok = db.prepare('INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)');

    const ornekIlaclar = [
      ['Parol 500mg 20 Tablet', '8699504010012', 'Agri Kesici', 'Atabay', 0, 20, 15.5, 24.9, '2027-03-01', [120, 60]],
      ['Aspirin 100mg 30 Tablet', '8699504010029', 'Agri Kesici', 'Bayer', 0, 15, 22.0, 35.5, '2026-11-15', [80, 40]],
      ['Augmentin BID 1000mg 14 Tablet', '8699504010036', 'Antibiyotik', 'GSK', 1, 10, 65.0, 98.75, '2026-05-20', [40, 15]],
      ['Nurofen 400mg 24 Tablet', '8699504010043', 'Agri Kesici', 'Reckitt', 0, 15, 28.0, 42.0, '2027-01-10', [60, 25]],
      ['Cipralex 10mg 28 Tablet', '8699504010050', 'Psikiyatrik', 'Lundbeck', 1, 8, 110.0, 165.0, '2026-09-30', [25, 10]],
      ['Voltaren Emulgel 50g', '8699504010067', 'Agri Kesici', 'Novartis', 0, 10, 48.0, 72.5, '2027-06-01', [45, 20]],
      ['Coraspin 100mg 30 Tablet', '8699504010074', 'Kalp Damar', 'Bayer', 0, 20, 18.0, 27.9, '2026-12-25', [90, 30]],
      ['Xanax 0.5mg 30 Tablet', '8699504010081', 'Psikiyatrik', 'Pfizer', 1, 5, 32.0, 49.0, '2026-08-05', [15, 5]],
      ['Talcid 500mg 20 Tablet', '8699504010098', 'Mide Bagirsak', 'Bayer', 0, 12, 20.0, 31.0, '2027-02-14', [55, 20]],
      ['Beloc Zok 50mg 28 Tablet', '8699504010104', 'Kalp Damar', 'AstraZeneca', 1, 10, 25.0, 38.5, '2026-10-01', [8, 3]]
    ];
    for (const [ad, barkod, kategori, uretici, receteli, kritikStok, alis, satis, skt, stoklar] of ornekIlaclar) {
      const info = insertIlac.run(ad, barkod, kategori, uretici, receteli, kritikStok, alis, satis, skt);
      subeler.forEach((sube, idx) => {
        insertStok.run(info.lastInsertRowid, sube.id, stoklar[idx] ?? 0);
      });
    }
  }

  const musteriCount = db.prepare('SELECT COUNT(*) AS c FROM musteriler').get().c;
  if (musteriCount === 0) {
    db.prepare('INSERT INTO musteriler (ad_soyad, telefon, email, tc_no, adres) VALUES (?, ?, ?, ?, ?)').run(
      'Ahmet Yilmaz', '05551112233', 'ahmet.yilmaz@example.com', '12345678901', 'Ataturk Mah. No:5, Istanbul'
    );
    db.prepare('INSERT INTO musteriler (ad_soyad, telefon, email, tc_no, adres) VALUES (?, ?, ?, ?, ?)').run(
      'Ayse Kaya', '05339876543', 'ayse.kaya@example.com', '98765432109', 'Cumhuriyet Cad. No:12, Ankara'
    );
  }

  const tedarikciCount = db.prepare('SELECT COUNT(*) AS c FROM tedarikciler').get().c;
  if (tedarikciCount === 0) {
    db.prepare('INSERT INTO tedarikciler (firma_adi, yetkili, telefon, email) VALUES (?, ?, ?, ?)').run(
      'Hedef Ilac Dagitim', 'Mehmet Demir', '02123334455', 'info@hedefilac.com'
    );
    db.prepare('INSERT INTO tedarikciler (firma_adi, yetkili, telefon, email) VALUES (?, ?, ?, ?)').run(
      'Selcuk Ecza Deposu', 'Fatma Sahin', '02163332211', 'satis@selcukecza.com'
    );
  }
}

seedIfEmpty();

module.exports = { db, hashPassword, verifyPassword };
