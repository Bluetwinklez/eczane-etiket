const express = require('express');
const { db } = require('../db');
const { sendCsv } = require('../export');
const { requireRole } = require('../auth');
const { URUN_TIPLERI, RECETE_TURLERI } = require('../sabitler');
const { partiGiris, partiCikis, partiMiktariniKontrolEt, FEFO_SIRASI } = require('../partiler');
const { karekodCoz } = require('../karekod');
const { maddeleriAyir } = require('../etkilesim');
const { satirlariCoz, SABLON } = require('../csvIceAktar');

// "Amoksisilin + Klavulanik asit" -> "amoksisilin, klavulanik asit"
function etkenMaddeNormallestir(deger) {
  const maddeler = maddeleriAyir(deger);
  return maddeler.length ? maddeler.join(', ') : null;
}

// Bos birakilirsa takip edilmez; 1-365 gun arasi tam sayi olmali
function kutuGunOku(deger) {
  if (deger === undefined || deger === null || deger === '') return null;
  const n = Number(deger);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : NaN;
}

// Ilacin gerektirdigi ozel recete: bos/beyaz = normal
function receteTuruOku(deger) {
  if (deger === undefined || deger === null || deger === '' || deger === 'beyaz') return null;
  return Object.prototype.hasOwnProperty.call(RECETE_TURLERI, deger) ? deger : NaN;
}

function urunTipiGecerliMi(tip) {
  return tip === undefined || tip === null || tip === '' || Object.prototype.hasOwnProperty.call(URUN_TIPLERI, tip);
}

const router = express.Router();

function resolveSubeId(req, queryValue) {
  if (req.user.rol === 'admin' && queryValue) {
    return queryValue === 'all' ? null : Number(queryValue);
  }
  return req.user.sube_id;
}

// en_yakin_skt: elde stogu kalan partiler arasindaki en yakin son kullanma tarihi
function ilacWithStok(subeId) {
  if (subeId) {
    return db
      .prepare(
        `SELECT i.*, COALESCE(s.stok, 0) AS stok,
                (SELECT MIN(p.skt) FROM ilac_partileri p
                  WHERE p.ilac_id = i.id AND p.sube_id = ? AND p.miktar > 0) AS en_yakin_skt,
                (SELECT COUNT(*) FROM ilac_partileri p
                  WHERE p.ilac_id = i.id AND p.sube_id = ? AND p.miktar > 0) AS aktif_parti_sayisi
         FROM ilaclar i
         LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
         ORDER BY i.ad`
      )
      .all(subeId, subeId, subeId);
  }
  return db
    .prepare(
      `SELECT i.*, COALESCE(SUM(s.stok), 0) AS stok,
              (SELECT MIN(p.skt) FROM ilac_partileri p WHERE p.ilac_id = i.id AND p.miktar > 0) AS en_yakin_skt,
              (SELECT COUNT(*) FROM ilac_partileri p WHERE p.ilac_id = i.id AND p.miktar > 0) AS aktif_parti_sayisi
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id
       GROUP BY i.id
       ORDER BY i.ad`
    )
    .all();
}

router.get('/', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  let rows = ilacWithStok(subeId);

  const { q, urun_tipi } = req.query;
  if (urun_tipi) rows = rows.filter((r) => r.urun_tipi === urun_tipi);
  if (req.query.hizli === '1') rows = rows.filter((r) => r.hizli_tus);
  if (q) {
    // Turkce buyuk/kucuk harf kurallariyla karsilastir (I/ı, İ/i)
    const kucuk = (m) => String(m || '').toLocaleLowerCase('tr-TR');
    const needle = kucuk(q);
    rows = rows.filter(
      (r) =>
        kucuk(r.ad).includes(needle) ||
        (r.barkod || '').includes(q) ||
        kucuk(r.kategori).includes(needle) ||
        kucuk(r.etken_madde).includes(needle) ||
        kucuk(r.raf_konumu) === needle
    );
  }
  res.json(rows);
});

const GEBELIK_UYARILARI = ['dikkat', 'kontrendike'];
// Hasta guvenligi ve raf alanlari: yalnizca istekte gelen alanlar guncellenir
function ekAlanlariKaydet(id, govde) {
  const alanlar = [];
  const degerler = [];
  if ('gebelik_uyari' in govde) {
    if (govde.gebelik_uyari && !GEBELIK_UYARILARI.includes(govde.gebelik_uyari)) return 'Geçersiz gebelik uyarısı';
    alanlar.push('gebelik_uyari = ?');
    degerler.push(govde.gebelik_uyari || null);
  }
  if ('min_yas' in govde) {
    const yas = govde.min_yas === '' || govde.min_yas == null ? null : Number(govde.min_yas);
    if (yas !== null && !(Number.isInteger(yas) && yas >= 0 && yas <= 99)) return 'Minimum yaş 0-99 arasında olmalı';
    alanlar.push('min_yas = ?');
    degerler.push(yas);
  }
  if ('yasli_uyari' in govde) {
    alanlar.push('yasli_uyari = ?');
    degerler.push(govde.yasli_uyari ? 1 : 0);
  }
  if ('hizli_tus' in govde) {
    alanlar.push('hizli_tus = ?');
    degerler.push(govde.hizli_tus ? 1 : 0);
  }
  if ('raf_konumu' in govde) {
    alanlar.push('raf_konumu = ?');
    degerler.push(String(govde.raf_konumu || '').trim().slice(0, 40) || null);
  }
  if (alanlar.length) db.prepare(`UPDATE ilaclar SET ${alanlar.join(', ')} WHERE id = ?`).run(...degerler, id);
  return null;
}

// Urun listesini (sube stoku ile) Excel uyumlu CSV olarak indirir
router.get('/disa-aktar', requireRole('admin', 'eczaci'), (req, res) => {
  const rows = ilacWithStok(req.user.sube_id).map((r) => ({ ...r, receteli: r.receteli ? 'Evet' : 'Hayır' }));
  sendCsv(res, 'ilaclar.csv', rows, [
    { alan: 'ad', baslik: 'Ad' },
    { alan: 'barkod', baslik: 'Barkod' },
    { alan: 'kategori', baslik: 'Kategori' },
    { alan: 'uretici', baslik: 'Üretici' },
    { alan: 'etken_madde', baslik: 'Etken Madde' },
    { alan: 'receteli', baslik: 'Reçeteli' },
    { alan: 'raf_konumu', baslik: 'Raf' },
    { alan: 'stok', baslik: 'Stok' },
    { alan: 'kritik_stok', baslik: 'Kritik Stok' },
    { alan: 'alis_fiyati', baslik: 'Alış Fiyatı' },
    { alan: 'satis_fiyati', baslik: 'Satış Fiyatı' },
    { alan: 'en_yakin_skt', baslik: 'En Yakın SKT' }
  ]);
});

// Ayni etken madde(ler)e sahip, bu subede stogu olan diger urunler
router.get('/:id/muadiller', (req, res) => {
  const ilac = db.prepare('SELECT id, etken_madde FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!ilac) return res.status(404).json({ error: 'İlaç bulunamadı' });
  const anahtar = (m) => String(m || '').toLocaleLowerCase('tr-TR').split(/[,+;/]/).map((x) => x.trim()).filter(Boolean).sort().join('+');
  const hedef = anahtar(ilac.etken_madde);
  if (!hedef) return res.json([]);
  const muadiller = ilacWithStok(req.user.sube_id)
    .filter((r) => r.id !== ilac.id && anahtar(r.etken_madde) === hedef)
    .sort((a, b) => (b.stok > 0) - (a.stok > 0) || a.satis_fiyati - b.satis_fiyati);
  res.json(muadiller);
});

router.get('/uyarilar', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const rows = ilacWithStok(subeId);

  const bugun = new Date();
  const otuzGunSonra = new Date(bugun.getTime() + 30 * 24 * 60 * 60 * 1000);

  const kritikStok = rows.filter((r) => r.stok <= r.kritik_stok);

  // SKT uyarilari parti bazindadir: elde stogu kalan her lot ayri degerlendirilir
  const sinir = otuzGunSonra.toISOString().slice(0, 10);
  let sql = `
    SELECT p.id AS parti_id, p.parti_no, p.skt, p.miktar AS stok, p.sube_id,
           i.id, i.ad, i.kritik_stok
    FROM ilac_partileri p
    JOIN ilaclar i ON i.id = p.ilac_id
    WHERE p.miktar > 0 AND p.skt IS NOT NULL AND p.skt <= ?`;
  const params = [sinir];
  if (subeId) {
    sql += ' AND p.sube_id = ?';
    params.push(subeId);
  }
  sql += ' ORDER BY p.skt, i.ad';
  const sktYaklasan = db
    .prepare(sql)
    .all(...params)
    .map((r) => ({ ...r, durum: new Date(r.skt) < bugun ? 'sona_ermis' : 'yaklasiyor' }));

  res.json({ kritik_stok: kritikStok, skt_yaklasan: sktYaklasan });
});

// CSV (Excel'den "CSV olarak kaydet") ile toplu urun ekleme/guncelleme.
// Barkodu kayitli urun guncellenir (yalnizca dolu hucreler), digerleri eklenir.
router.get('/ice-aktar/sablon', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="urun-sablonu.csv"');
  res.send('﻿' + SABLON);
});

const ICE_AKTAR_ALANLARI = ['ad', 'barkod', 'kategori', 'uretici', 'receteli', 'alis_fiyati', 'satis_fiyati', 'kritik_stok', 'urun_tipi', 'etken_madde', 'kutu_gun', 'skt'];

router.post('/ice-aktar', requireRole('admin', 'eczaci'), (req, res) => {
  if (typeof req.body.csv !== 'string' || !req.body.csv.trim()) return res.status(400).json({ error: 'CSV içeriği boş' });
  const cozum = satirlariCoz(req.body.csv);
  if (cozum.hata) return res.status(400).json({ error: cozum.hata });
  if (cozum.satirlar.length > 5000) return res.status(400).json({ error: 'Tek seferde en fazla 5000 satır' });

  const barkodla = db.prepare('SELECT * FROM ilaclar WHERE barkod = ?');
  const gorulenBarkod = new Set();
  const plan = cozum.satirlar.map((s) => {
    const a = s.alanlar;
    const hatalar = [...s.hatalar];
    if (a.barkod) {
      if (gorulenBarkod.has(a.barkod)) hatalar.push('aynı barkod dosyada birden fazla');
      gorulenBarkod.add(a.barkod);
    }
    const mevcut = a.barkod ? barkodla.get(a.barkod) : null;
    if (!mevcut) {
      if (!a.ad) hatalar.push('yeni ürün için ad zorunlu');
      if (a.satis_fiyati == null) hatalar.push('yeni ürün için satış fiyatı zorunlu');
    }
    const degisen = mevcut ? ICE_AKTAR_ALANLARI.filter((f) => a[f] !== undefined && a[f] !== mevcut[f]) : [];
    return {
      satir: s.satir,
      islem: hatalar.length ? 'hata' : mevcut ? (degisen.length ? 'guncelle' : 'ayni') : 'yeni',
      ilac_id: mevcut ? mevcut.id : null,
      ad: a.ad || (mevcut && mevcut.ad) || '',
      barkod: a.barkod || null,
      degisen,
      hatalar,
      alanlar: a,
      eski_satis: mevcut ? mevcut.satis_fiyati : null
    };
  });
  const ozet = {
    yeni: plan.filter((p) => p.islem === 'yeni').length,
    guncelle: plan.filter((p) => p.islem === 'guncelle').length,
    ayni: plan.filter((p) => p.islem === 'ayni').length,
    hata: plan.filter((p) => p.islem === 'hata').length
  };
  if (req.body.onizleme) return res.json({ ozet, satirlar: plan, taninan_sutunlar: cozum.sutunlar });
  if (ozet.hata) return res.status(400).json({ error: `${ozet.hata} satırda hata var; önce düzeltin`, ozet, satirlar: plan });

  db.exec('BEGIN');
  try {
    const subeler = db.prepare('SELECT id FROM subeler').all();
    const stokEkle = db.prepare('INSERT OR IGNORE INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, 0)');
    const gecmis = db.prepare('INSERT INTO fiyat_gecmisi (ilac_id, eski_fiyat, yeni_fiyat) VALUES (?, ?, ?)');
    for (const p of plan) {
      if (p.islem === 'yeni') {
        const a = p.alanlar;
        const id = Number(
          db
            .prepare(
              `INSERT INTO ilaclar (ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt, urun_tipi, etken_madde, kutu_gun)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(a.ad, a.barkod || null, a.kategori || null, a.uretici || null, a.receteli || 0, a.kritik_stok ?? 10, a.alis_fiyati || 0,
              a.satis_fiyati, a.skt || null, a.urun_tipi || 'ilac', a.etken_madde || null, a.kutu_gun ?? null).lastInsertRowid
        );
        for (const s of subeler) stokEkle.run(id, s.id);
        p.ilac_id = id;
      } else if (p.islem === 'guncelle') {
        const set = p.degisen.map((f) => `${f} = ?`).join(', ');
        db.prepare(`UPDATE ilaclar SET ${set} WHERE id = ?`).run(...p.degisen.map((f) => p.alanlar[f]), p.ilac_id);
        if (p.degisen.includes('satis_fiyati')) gecmis.run(p.ilac_id, p.eski_satis, p.alanlar.satis_fiyati);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'İçe aktarma başarısız: ' + err.message });
  }
  res.json({ ozet, satirlar: plan });
});

// Son `gun` gun icinde satis fiyati degisen urunler (yeni raf etiketi basmak icin)
router.get('/fiyat-degisenler', (req, res) => {
  const gun = Math.min(365, Math.max(1, Number(req.query.gun) || 7));
  const rows = db
    .prepare(
      `SELECT ilac_id, MAX(tarih) AS son_degisim FROM fiyat_gecmisi
       WHERE tarih >= datetime('now', ?) GROUP BY ilac_id`
    )
    .all(`-${gun} days`);
  res.json(rows);
});

// Toplu fiyat guncelleme (orn. ilac fiyat kararnamesi, dermokozmetik zam donemi)
const YUVARLAMALAR = {
  kurus: (f) => Math.round(f * 100) / 100,
  yarim: (f) => Math.round(f * 2) / 2,
  lira: (f) => Math.round(f),
  // Psikolojik fiyat: 123,40 -> 122,90 / 123,90 (en yakin ,90)
  doksan: (f) => Math.max(0.9, Math.round(f + 0.1) - 0.1)
};

function topluFiyatHedefleri(hedef) {
  let sql = 'SELECT id, ad, kategori, urun_tipi, receteli, alis_fiyati, satis_fiyati FROM ilaclar WHERE 1=1';
  const params = [];
  const tip = hedef && hedef.tip;
  if (tip === 'kategori') {
    sql += ' AND kategori = ?';
    params.push(String(hedef.deger || ''));
  } else if (tip === 'urun_tipi') {
    sql += ' AND urun_tipi = ?';
    params.push(String(hedef.deger || ''));
  } else if (tip === 'receteli') {
    sql += ' AND receteli = 1';
  } else if (tip === 'recetesiz') {
    sql += ' AND receteli = 0';
  } else if (tip !== 'tumu') {
    return null;
  }
  return db.prepare(sql + ' ORDER BY ad').all(...params);
}

router.post('/toplu-fiyat', requireRole('admin', 'eczaci'), (req, res) => {
  const { hedef, onizleme } = req.body;
  const yuzde = Number(req.body.yuzde);
  const alan = req.body.alan || 'satis';
  const yuvarla = YUVARLAMALAR[req.body.yuvarlama || 'kurus'];
  if (!Number.isFinite(yuzde) || yuzde === 0 || yuzde < -90 || yuzde > 500) {
    return res.status(400).json({ error: 'Yüzde -90 ile 500 arasında ve sıfırdan farklı olmalı' });
  }
  if (!['satis', 'alis', 'ikisi'].includes(alan)) return res.status(400).json({ error: 'Geçersiz fiyat alanı' });
  if (!yuvarla) return res.status(400).json({ error: 'Geçersiz yuvarlama' });

  const urunler = topluFiyatHedefleri(hedef);
  if (!urunler) return res.status(400).json({ error: 'Geçersiz hedef' });

  const carpan = 1 + yuzde / 100;
  const degisiklikler = urunler.map((u) => {
    const yeniSatis = alan === 'alis' ? u.satis_fiyati : yuvarla(u.satis_fiyati * carpan);
    // Alis fiyati faturadan gelir; psikolojik yuvarlama uygulanmaz
    const yeniAlis = alan === 'satis' ? u.alis_fiyati : Math.round(u.alis_fiyati * carpan * 100) / 100;
    return {
      id: u.id,
      ad: u.ad,
      eski_satis: u.satis_fiyati,
      yeni_satis: yeniSatis,
      eski_alis: u.alis_fiyati,
      yeni_alis: yeniAlis,
      // Satis fiyati alisin altina duserse uyar
      zararina: yeniSatis < yeniAlis
    };
  });

  if (onizleme) return res.json({ urun_sayisi: degisiklikler.length, degisiklikler });
  if (!degisiklikler.length) return res.status(400).json({ error: 'Hedefte ürün yok' });

  db.exec('BEGIN');
  try {
    const guncelle = db.prepare('UPDATE ilaclar SET satis_fiyati = ?, alis_fiyati = ? WHERE id = ?');
    const gecmis = db.prepare('INSERT INTO fiyat_gecmisi (ilac_id, eski_fiyat, yeni_fiyat) VALUES (?, ?, ?)');
    for (const d of degisiklikler) {
      guncelle.run(d.yeni_satis, d.yeni_alis, d.id);
      if (d.yeni_satis !== d.eski_satis) gecmis.run(d.id, d.eski_satis, d.yeni_satis);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Fiyatlar güncellenemedi' });
  }
  res.json({ urun_sayisi: degisiklikler.length, degisiklikler });
});

// Karekod (GS1 DataMatrix) okutuldugunda urunu, parti ve SKT bilgisini doner
router.get('/karekod', (req, res) => {
  const karekod = karekodCoz(req.query.kod);
  if (!karekod) return res.status(400).json({ error: 'Karekod okunamadı' });

  const subeId = resolveSubeId(req, req.query.sube_id);
  const ilac = ilacWithStok(subeId).find((r) => r.barkod === karekod.barkod || r.barkod === karekod.gtin) || null;

  let parti = null;
  if (ilac && karekod.parti_no) {
    parti =
      db
        .prepare('SELECT * FROM ilac_partileri WHERE ilac_id = ? AND parti_no = ? AND (? IS NULL OR sube_id = ?) ORDER BY id DESC')
        .get(ilac.id, karekod.parti_no, subeId, subeId) || null;
  }
  const bugun = new Date().toISOString().slice(0, 10);
  res.json({
    karekod,
    ilac,
    parti,
    skt_gecmis: Boolean(karekod.skt && karekod.skt < bugun)
  });
});

router.get('/:id', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const rows = ilacWithStok(subeId);
  const row = rows.find((r) => r.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'İlaç bulunamadı' });
  res.json(row);
});

router.get('/:id/partiler', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const tumu = req.query.tumu === '1';
  let sql = `SELECT p.*, s.ad AS sube_adi FROM ilac_partileri p
             JOIN subeler s ON s.id = p.sube_id
             WHERE p.ilac_id = ?`;
  const params = [Number(req.params.id)];
  if (subeId) {
    sql += ' AND p.sube_id = ?';
    params.push(subeId);
  }
  if (!tumu) sql += ' AND p.miktar > 0';
  sql += ` ${FEFO_SIRASI.replace(/\b(skt|id)\b/g, 'p.$1')}`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id/fiyat-gecmisi', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM fiyat_gecmisi WHERE ilac_id = ? ORDER BY tarih DESC')
    .all(req.params.id);
  res.json(rows);
});

router.post('/', requireRole('admin', 'eczaci'), (req, res) => {
  const { ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt, stok, urun_tipi, etken_madde } = req.body;
  if (!ad || !ad.trim()) return res.status(400).json({ error: 'İlaç adı zorunludur' });
  const kutuGun = kutuGunOku(req.body.kutu_gun);
  if (Number.isNaN(kutuGun)) return res.status(400).json({ error: 'Kutu süresi 1-365 gün arasında olmalı' });
  const receteTuru = receteTuruOku(req.body.recete_turu);
  if (Number.isNaN(receteTuru)) return res.status(400).json({ error: 'Geçersiz reçete türü' });
  if (!urunTipiGecerliMi(urun_tipi)) return res.status(400).json({ error: 'Geçersiz ürün tipi' });
  if (satis_fiyati == null || Number(satis_fiyati) < 0) {
    return res.status(400).json({ error: 'Geçerli bir satış fiyatı girin' });
  }

  db.exec('BEGIN');
  try {
    const info = db
      .prepare(
        `INSERT INTO ilaclar (ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt, urun_tipi, etken_madde, kutu_gun, recete_turu)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ad.trim(),
        barkod || null,
        kategori || null,
        uretici || null,
        receteli || receteTuru ? 1 : 0,
        Number(kritik_stok) || 10,
        Number(alis_fiyati) || 0,
        Number(satis_fiyati),
        skt || null,
        urun_tipi || 'ilac',
        etkenMaddeNormallestir(etken_madde),
        kutuGun,
        receteTuru
      );

    const subeler = db.prepare('SELECT id FROM subeler').all();
    const baslangicStok = Number(stok) || 0;
    const insertStok = db.prepare('INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)');
    for (const sube of subeler) {
      insertStok.run(info.lastInsertRowid, sube.id, sube.id === req.user.sube_id ? baslangicStok : 0);
    }
    if (baslangicStok > 0) {
      partiGiris(Number(info.lastInsertRowid), req.user.sube_id, baslangicStok, {
        parti_no: req.body.parti_no,
        skt: skt || null,
        kaynak: 'acilis'
      });
    }
    const ekHata = ekAlanlariKaydet(Number(info.lastInsertRowid), req.body);
    if (ekHata) {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: ekHata });
    }
    db.exec('COMMIT');

    const created = ilacWithStok(req.user.sube_id).find((r) => r.id === Number(info.lastInsertRowid));
    res.status(201).json(created);
  } catch (err) {
    db.exec('ROLLBACK');
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu barkod zaten kayıtlı' });
    }
    res.status(500).json({ error: 'İlaç eklenemedi' });
  }
});

router.put('/:id', requireRole('admin', 'eczaci'), (req, res) => {
  const existing = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'İlaç bulunamadı' });

  const { ad, barkod, kategori, uretici, receteli, kritik_stok, alis_fiyati, satis_fiyati, skt, urun_tipi, etken_madde } = req.body;
  if (!ad || !ad.trim()) return res.status(400).json({ error: 'İlaç adı zorunludur' });
  // kutu_gun gonderilmezse mevcut deger korunur
  const kutuGun = 'kutu_gun' in req.body ? kutuGunOku(req.body.kutu_gun) : existing.kutu_gun;
  if (Number.isNaN(kutuGun)) return res.status(400).json({ error: 'Kutu süresi 1-365 gün arasında olmalı' });
  const receteTuru = 'recete_turu' in req.body ? receteTuruOku(req.body.recete_turu) : existing.recete_turu;
  if (Number.isNaN(receteTuru)) return res.status(400).json({ error: 'Geçersiz reçete türü' });
  if (!urunTipiGecerliMi(urun_tipi)) return res.status(400).json({ error: 'Geçersiz ürün tipi' });

  db.exec('BEGIN');
  try {
    const yeniSatisFiyati = Number(satis_fiyati) || 0;
    db.prepare(
      `UPDATE ilaclar SET ad=?, barkod=?, kategori=?, uretici=?, receteli=?, kritik_stok=?, alis_fiyati=?, satis_fiyati=?, skt=?, urun_tipi=?,
       etken_madde=?, kutu_gun=?, recete_turu=? WHERE id=?`
    ).run(
      ad.trim(),
      barkod || null,
      kategori || null,
      uretici || null,
      receteli || receteTuru ? 1 : 0,
      Number(kritik_stok) || 10,
      Number(alis_fiyati) || 0,
      yeniSatisFiyati,
      skt || null,
      urun_tipi || existing.urun_tipi,
      etken_madde === undefined ? existing.etken_madde : etkenMaddeNormallestir(etken_madde),
      kutuGun,
      receteTuru,
      req.params.id
    );

    if (yeniSatisFiyati !== existing.satis_fiyati) {
      db.prepare('INSERT INTO fiyat_gecmisi (ilac_id, eski_fiyat, yeni_fiyat) VALUES (?, ?, ?)').run(
        req.params.id,
        existing.satis_fiyati,
        yeniSatisFiyati
      );
    }
    const ekHata = ekAlanlariKaydet(Number(req.params.id), req.body);
    if (ekHata) {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: ekHata });
    }
    db.exec('COMMIT');

    const updated = ilacWithStok(req.user.sube_id).find((r) => r.id === Number(req.params.id));
    res.json(updated);
  } catch (err) {
    db.exec('ROLLBACK');
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu barkod zaten kayıtlı' });
    }
    res.status(500).json({ error: 'İlaç güncellenemedi' });
  }
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'İlaç bulunamadı' });
  db.prepare('DELETE FROM ilaclar WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.post('/:id/stok', requireRole('admin', 'eczaci'), (req, res) => {
  const ilac = db.prepare('SELECT * FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!ilac) return res.status(404).json({ error: 'İlaç bulunamadı' });

  const subeId = req.user.rol === 'admin' && req.body.sube_id ? Number(req.body.sube_id) : req.user.sube_id;
  const { tip, adet, aciklama, parti_no, skt, parti_id } = req.body;
  const miktar = Number(adet);
  if (!['giris', 'cikis'].includes(tip) || !Number.isInteger(miktar) || miktar <= 0) {
    return res.status(400).json({ error: 'Geçersiz stok hareketi' });
  }
  if (skt && !/^\d{4}-\d{2}-\d{2}$/.test(skt)) {
    return res.status(400).json({ error: 'SKT YYYY-AA-GG formatında olmalı' });
  }

  const mevcut = db
    .prepare('SELECT stok FROM ilac_stok WHERE ilac_id = ? AND sube_id = ?')
    .get(req.params.id, subeId);
  const mevcutStok = mevcut ? mevcut.stok : 0;
  const yeniStok = tip === 'giris' ? mevcutStok + miktar : mevcutStok - miktar;
  if (yeniStok < 0) {
    return res.status(400).json({ error: 'Stok yetersiz' });
  }

  // Belirli bir partiden cikis (orn. SKT'si gecen lotun imhasi)
  if (tip === 'cikis' && parti_id) {
    const parti = partiMiktariniKontrolEt(Number(parti_id), ilac.id, subeId);
    if (!parti) return res.status(404).json({ error: 'Parti bulunamadı' });
    if (parti.miktar < miktar) return res.status(400).json({ error: `Partide yeterli miktar yok (kalan: ${parti.miktar})` });
  }

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
       ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = excluded.stok`
    ).run(req.params.id, subeId, yeniStok);

    if (tip === 'giris') {
      partiGiris(ilac.id, subeId, miktar, { parti_no, skt, kaynak: 'stok_girisi' });
    } else {
      partiCikis(ilac.id, subeId, miktar, parti_id ? Number(parti_id) : null);
    }

    db.prepare(
      'INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, subeId, tip, miktar, aciklama || null);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Stok hareketi kaydedilemedi' });
  }

  const updated = ilacWithStok(subeId).find((r) => r.id === Number(req.params.id));
  res.json(updated);
});

router.get('/:id/hareketler', (req, res) => {
  const subeId = resolveSubeId(req, req.query.sube_id);
  const rows = subeId
    ? db
        .prepare('SELECT * FROM stok_hareketleri WHERE ilac_id = ? AND sube_id = ? ORDER BY tarih DESC')
        .all(req.params.id, subeId)
    : db.prepare('SELECT * FROM stok_hareketleri WHERE ilac_id = ? ORDER BY tarih DESC').all(req.params.id);
  res.json(rows);
});

module.exports = router;
