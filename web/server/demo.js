// Demo modu (ECZAM_DEMO=1): internette herkese acik deneme sunucusu ve App Store incelemesi icin.
// - Sabit demo hesabi (varsayilan demo / demo1234, eczaci rolu); sifresi her acilista sifirlanir ve degistirilemez
// - Diger hesaplarin (admin, eczaci, kasiyer) bilinen varsayilan sifreleri herkese acik sunucuda kullanilamasin diye
//   rastgele sifreyle degistirilir; yonetici sifresi ECZAM_ADMIN_SIFRE ile verilebilir
// - Satis yoksa son 40 gune gercekci saat dagilimli ornek satislar eklenir (veriler sahtedir)
const crypto = require('crypto');
const { db, hashPassword } = require('./db');

const demoAcikMi = () => process.env.ECZAM_DEMO === '1';
const demoHesabi = () => ({
  kullanici: String(process.env.ECZAM_DEMO_KULLANICI || 'demo').trim(),
  sifre: String(process.env.ECZAM_DEMO_SIFRE || 'demo1234'),
});

function sifreAyarla(id, sifre, degistirilmeli) {
  const { hash, salt } = hashPassword(sifre);
  db.prepare('UPDATE kullanicilar SET sifre_hash = ?, sifre_salt = ?, sifre_degistirilmeli = ? WHERE id = ?').run(hash, salt, degistirilmeli ? 1 : 0, id);
}

function hesaplariHazirla() {
  const { kullanici, sifre } = demoHesabi();
  const sube = db.prepare('SELECT id FROM subeler ORDER BY id LIMIT 1').get().id;
  let demo = db.prepare('SELECT id FROM kullanicilar WHERE kullanici_adi = ?').get(kullanici);
  if (!demo) {
    const { hash, salt } = hashPassword(sifre);
    demo = {
      id: db
        .prepare(
          `INSERT INTO kullanicilar (kullanici_adi, sifre_hash, sifre_salt, ad_soyad, rol, sube_id, sifre_degistirilmeli)
           VALUES (?, ?, ?, 'Demo Eczacı', 'eczaci', ?, 0)`
        )
        .run(kullanici, hash, salt, sube).lastInsertRowid,
    };
  }
  sifreAyarla(demo.id, sifre, false);
  db.prepare("UPDATE kullanicilar SET aktif = 1, rol = 'eczaci' WHERE id = ?").run(demo.id);

  const adminSifre = process.env.ECZAM_ADMIN_SIFRE;
  for (const k of db.prepare('SELECT id, kullanici_adi FROM kullanicilar WHERE id != ?').all(demo.id)) {
    if (k.kullanici_adi === 'admin' && adminSifre) sifreAyarla(k.id, adminSifre, false);
    else sifreAyarla(k.id, crypto.randomBytes(24).toString('base64url'), false);
  }
  return demo.id;
}

// Kategorilere farkli agirlik: grafikler anlamli bir sekil alsin
const KATEGORI_AGIRLIK = { 'Ağrı Kesici': 5, 'Vitamin': 3, 'Cilt Bakım': 3, 'Kalp Damar': 2, 'Mide Bağırsak': 2, 'Antibiyotik': 1.5 };
const SAAT_AGIRLIK = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 4, 5, 3, 2, 3, 4, 6, 8, 5, 2, 1, 0, 0];

function ornekSatislar({ gunSayisi = 40, rastgele = Math.random, simdi = Date.now() } = {}) {
  if (db.prepare('SELECT COUNT(*) AS c FROM satislar').get().c > 0) return 0;
  const ilaclar = db.prepare('SELECT id, ad, kategori, satis_fiyati, alis_fiyati FROM ilaclar WHERE satis_fiyati > 0').all();
  if (!ilaclar.length) return 0;
  const havuz = ilaclar.flatMap((i) => Array(Math.max(1, Math.round((KATEGORI_AGIRLIK[i.kategori] || 0.6) * 2))).fill(i));
  const sube = db.prepare('SELECT id FROM subeler ORDER BY id LIMIT 1').get().id;
  const kullanici = db.prepare('SELECT id FROM kullanicilar ORDER BY id LIMIT 1').get().id;
  const insSatis = db.prepare('INSERT INTO satislar (sube_id, kullanici_id, ara_toplam, toplam_tutar, odeme_tipi, tarih) VALUES (?, ?, ?, ?, ?, ?)');
  const insKalem = db.prepare(
    'INSERT INTO satis_kalemleri (satis_id, ilac_id, ilac_adi, adet, birim_fiyat, alis_fiyati, ara_toplam) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const odemeler = ['nakit', 'nakit', 'kredi_karti', 'kredi_karti', 'sgk'];
  const simdiTarih = new Date(simdi);
  let sayi = 0;
  db.exec('BEGIN');
  try {
    for (let gun = 0; gun <= gunSayisi; gun++) {
      for (let saat = 9; saat < 22; saat++) {
        const t = new Date(simdi - gun * 86400000);
        t.setUTCHours(saat - 3, Math.floor(rastgele() * 60), 0, 0);
        if (t > simdiTarih) continue; // bugunun gelecek saatleri yok
        const n = Math.round(SAAT_AGIRLIK[saat] * (0.5 + rastgele()) * (gun % 7 === 5 ? 1.6 : 1) * (gun > 7 ? 0.85 : 1));
        for (let i = 0; i < n; i++) {
          const kalemler = Array.from({ length: 1 + Math.floor(rastgele() * 3) }, () => {
            const il = havuz[Math.floor(rastgele() * havuz.length)];
            const adet = 1 + Math.floor(rastgele() * 2);
            return { il, adet, ara: Math.round(il.satis_fiyati * adet * 100) / 100 };
          });
          const toplam = Math.round(kalemler.reduce((s, k) => s + k.ara, 0) * 100) / 100;
          const tarih = new Date(t.getTime() + i * 60000).toISOString().slice(0, 19).replace('T', ' ');
          const sid = insSatis.run(sube, kullanici, toplam, toplam, odemeler[Math.floor(rastgele() * odemeler.length)], tarih).lastInsertRowid;
          for (const k of kalemler) insKalem.run(sid, k.il.id, k.il.ad, k.adet, k.il.satis_fiyati, k.il.alis_fiyati || 0, k.ara);
          sayi++;
        }
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return sayi;
}

function demoHazirla() {
  if (!demoAcikMi()) return null;
  const demoId = hesaplariHazirla();
  const satis = ornekSatislar();
  return { demoId, satis };
}

// Demo hesabi sifresini degistiremez (herkes ayni hesabi kullaniyor)
function demoHesabiMi(user) {
  return demoAcikMi() && user && user.kullanici_adi === demoHesabi().kullanici;
}

module.exports = { demoAcikMi, demoHesabi, demoHazirla, demoHesabiMi, ornekSatislar };
