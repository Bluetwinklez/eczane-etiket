// SGK SUT listeleri: EK-4/A odeme listesi, EK-4/D katilim payindan muafiyet (ICD-10), EK-4/E ve EK-4/F kurallari.
// Resmi dosya (SGK "Guncel 2013 SUT" zip'i veya tek tek liste dosyalari) yuklenir ya da sgk.gov.tr'den indirilir.
const express = require('express');
const { db, ayarOku, ayarYaz } = require('../db');
const { requireRole } = require('../auth');
const S = require('../sgk');
const { yerelSimdi } = require('../zaman');

const router = express.Router();
const yonetici = requireRole('admin', 'eczaci');
const MAKS = 80 * 1024 * 1024;

function durumBilgisi() {
  const say = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  return {
    ek4a: say('sgk_ek4a'),
    ek4d_grup: say('sgk_ek4d_gruplar'),
    ek4d_icd: say('sgk_ek4d_icd'),
    ek4d_ilac: say('sgk_ek4d_ilaclar'),
    ek4e: db.prepare("SELECT COUNT(*) AS n FROM sgk_kurallar WHERE liste = 'EK-4E'").get().n,
    ek4f: db.prepare("SELECT COUNT(*) AS n FROM sgk_kurallar WHERE liste = 'EK-4F'").get().n,
    liste_tarihi: ayarOku('sgk_liste_tarihi'),
    yuklenme: ayarOku('sgk_yuklenme')
  };
}

function bantlar() {
  try {
    return JSON.parse(ayarOku('sgk_ek4a_bantlar') || '[]');
  } catch {
    return [];
  }
}

// Ayrismis listeleri kaydeder; yalnizca dosyada bulunan listeler degistirilir
function kaydet(c) {
  const ozet = {};
  db.exec('BEGIN');
  try {
    if (c.ek4a) {
      db.exec('DELETE FROM sgk_ek4a');
      const ekle = db.prepare(
        `INSERT INTO sgk_ek4a (barkod, kamu_no, ad, eski_barkodlar, esdeger_grup, referans_grup, giris_tarihi, aktif_tarihi, pasif_tarihi, durum,
                               isk1, isk2, isk3, isk4, ozel_iskonto, eczaci_iskonto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const k of c.ek4a.kayitlar) {
        const i = k.iskontolar;
        ekle.run(k.barkod, k.kamu_no, k.ad, k.eski_barkodlar, k.esdeger_grup, k.referans_grup, k.giris_tarihi, k.aktif_tarihi, k.pasif_tarihi, k.durum,
          i[0] ?? null, i[1] ?? null, i[2] ?? null, i[3] ?? null, k.ozel_iskonto, k.eczaci_iskonto);
      }
      ayarYaz('sgk_ek4a_bantlar', JSON.stringify(c.ek4a.bantlar));
      // Katalogdaki listede olan (pasiflenmemis) urunler "SGK kapsaminda" isaretlenir
      const bugun = yerelSimdi().toISOString().slice(0, 10);
      const kapsam = `SELECT i.id FROM ilaclar i JOIN sgk_ek4a a ON a.barkod = i.barkod WHERE a.pasif_tarihi IS NULL OR a.pasif_tarihi > '${bugun}'`;
      db.exec(`INSERT OR IGNORE INTO ilac_bilgi (ilac_id) ${kapsam}`);
      ozet.sgk_isaretlenen = Number(db.prepare(`UPDATE ilac_bilgi SET sgk_kapsaminda = 1, guncelleme = datetime('now') WHERE sgk_kapsaminda = 0 AND ilac_id IN (${kapsam})`).run().changes);
    }
    if (c.ek4d) {
      db.exec('DELETE FROM sgk_ek4d_icd; DELETE FROM sgk_ek4d_ilaclar; DELETE FROM sgk_ek4d_gruplar;');
      const g = db.prepare('INSERT INTO sgk_ek4d_gruplar (kod, ana, baslik, araliklar, ortak_not) VALUES (?, ?, ?, ?, ?)');
      const icd = db.prepare('INSERT INTO sgk_ek4d_icd (grup_id, icd, ad) VALUES (?, ?, ?)');
      const il = db.prepare('INSERT INTO sgk_ek4d_ilaclar (grup_id, no, ad, endikasyon, kosul) VALUES (?, ?, ?, ?, ?)');
      for (const x of c.ek4d) {
        const id = Number(g.run(x.kod, x.ana, x.baslik, JSON.stringify(x.araliklar), x.ortak_not || null).lastInsertRowid);
        for (const k of x.icd) icd.run(id, k.kod, k.ad || null);
        for (const m of x.ilaclar) il.run(id, m.no, m.ad, m.endikasyon ? 1 : 0, m.kosul);
      }
    }
    const kural = db.prepare('INSERT INTO sgk_kurallar (liste, grup, no, baslik, metin) VALUES (?, ?, ?, ?, ?)');
    if (c.ek4e) {
      db.exec("DELETE FROM sgk_kurallar WHERE liste = 'EK-4E'");
      for (const k of c.ek4e.kurallar) kural.run('EK-4E', k.grup, k.no, k.baslik, k.metin || '-');
      ayarYaz('sgk_ek4e_aciklama', c.ek4e.aciklama || '');
    }
    if (c.ek4f) {
      db.exec("DELETE FROM sgk_kurallar WHERE liste = 'EK-4F'");
      for (const k of c.ek4f) kural.run('EK-4F', null, null, k.baslik, k.metin);
    }
    if (c.liste_tarihi) ayarYaz('sgk_liste_tarihi', c.liste_tarihi);
    ayarYaz('sgk_yuklenme', yerelSimdi().toISOString().slice(0, 16).replace('T', ' '));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ...durumBilgisi(), ...ozet, yuklenen: ['ek4a', 'ek4d', 'ek4e', 'ek4f'].filter((k) => c[k]) };
}

function isle(tampon, ad, res) {
  let cozum;
  try {
    cozum = S.tekDosyaCoz(tampon, ad);
  } catch (err) {
    return res.status(400).json({ error: err.kullaniciHatasi ? err.message : 'Dosya okunamadı: ' + err.message });
  }
  res.json(kaydet(cozum));
}

router.get('/durum', (req, res) => res.json(durumBilgisi()));

router.post('/yukle', yonetici, express.raw({ type: 'application/octet-stream', limit: MAKS }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Dosya gönderilmedi' });
  isle(req.body, String(req.query.ad || ''), res);
});

// sgk.gov.tr: guncel SUT duyurusundaki zip (yalnizca bu alan adi, yonlendirmeler de denetlenir)
const SGK = 'https://www.sgk.gov.tr';
async function sgkGetir(adres, fetchFn) {
  let url = new URL(adres, SGK);
  for (let i = 0; i < 4; i++) {
    if (url.protocol !== 'https:' || !/(^|\.)sgk\.gov\.tr$/i.test(url.hostname)) throw new Error('Yalnızca sgk.gov.tr adresinden indirilebilir');
    const y = await fetchFn(url, { redirect: 'manual', signal: AbortSignal.timeout(180000) });
    if (y.status >= 300 && y.status < 400 && y.headers.get('location')) {
      url = new URL(y.headers.get('location'), url);
      continue;
    }
    if (!y.ok) throw new Error(`SGK sitesi ${y.status} döndürdü`);
    return y;
  }
  throw new Error('Çok fazla yönlendirme');
}
async function sonSutIndir(fetchFn = fetch) {
  let duyuru = null;
  for (const sayfa of ['/', '/Duyuru']) {
    const html = await (await sgkGetir(sayfa, fetchFn)).text();
    duyuru = (html.match(/href="([^"]*Guncel-2013-SUT[^"]*)"/i) || [])[1];
    if (duyuru) break;
  }
  if (!duyuru) throw new Error('SGK sitesinde güncel SUT duyurusu bulunamadı');
  const detay = await (await sgkGetir(duyuru, fetchFn)).text();
  const zip = (detay.match(/href="([^"]*DownloadFile[^"]*\.zip[^"]*)"/i) || [])[1];
  if (!zip) throw new Error('Duyuruda SUT dosyası bulunamadı');
  const y = await sgkGetir(zip.replace(/&amp;/g, '&'), fetchFn);
  const tampon = Buffer.from(await y.arrayBuffer());
  if (tampon.length > MAKS) throw new Error('Dosya beklenenden büyük');
  return tampon;
}

router.post('/indir', yonetici, async (req, res) => {
  let tampon;
  try {
    tampon = await sonSutIndir();
  } catch (err) {
    return res.status(502).json({ error: 'SUT dosyası indirilemedi (internet bağlantısını kontrol edin): ' + err.message });
  }
  isle(tampon, 'sut.zip', res);
});

// ---- Arama yardimcilari ----
function gruplariGetir(idler) {
  if (!idler.length) return [];
  const yer = idler.map(() => '?').join(',');
  const gruplar = db.prepare(`SELECT * FROM sgk_ek4d_gruplar WHERE id IN (${yer}) ORDER BY id`).all(...idler);
  const icdler = db.prepare(`SELECT grup_id, icd, ad FROM sgk_ek4d_icd WHERE grup_id IN (${yer})`).all(...idler);
  const ilaclar = db.prepare(`SELECT grup_id, no, ad, endikasyon, kosul FROM sgk_ek4d_ilaclar WHERE grup_id IN (${yer}) ORDER BY rowid`).all(...idler);
  return gruplar.map((g) => ({
    ...g,
    araliklar: JSON.parse(g.araliklar || '[]'),
    icd: icdler.filter((x) => x.grup_id === g.id).map(({ icd, ad }) => ({ kod: icd, ad })),
    ilaclar: ilaclar.filter((x) => x.grup_id === g.id).map(({ no, ad, endikasyon, kosul }) => ({ no, ad, endikasyon: !!endikasyon, kosul }))
  }));
}

function katalog(subeId) {
  return db
    .prepare(
      `SELECT i.id, i.ad, i.etken_madde, COALESCE(s.stok, 0) AS stok, i.satis_fiyati,
              COALESCE(b.atc_kodu, t.atc_kodu) AS atc_kodu, t.atc_adi
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       LEFT JOIN ilac_bilgi b ON b.ilac_id = i.id
       LEFT JOIN titck_ilaclar t ON t.barkod = i.barkod
       WHERE i.urun_tipi IS NULL OR i.urun_tipi = 'ilac'`
    )
    .all(subeId)
    .map((r) => ({ ...r, anahtar: { anahtarlar: S.etkenAnahtarlari(r.etken_madde, r.atc_adi), atc: r.atc_kodu } }));
}

// ICD-10 kodu ya da hastalik adiyla muafiyet arama
router.get('/icd', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ sorgu: q, gruplar: [] });
  const kod = S.icdNorm(q);
  let idler;
  if (kod && /^[A-Za-z]\s?\d/.test(q)) {
    const tum = gruplariGetir(db.prepare('SELECT id FROM sgk_ek4d_gruplar').all().map((r) => r.id));
    idler = tum.filter((g) => S.icdKapsar(g, kod)).map((g) => g.id);
  } else {
    const aranan = S.fonetik(q);
    const adaylar = db.prepare('SELECT g.id, g.baslik, g.ana, (SELECT group_concat(ad, \' \') FROM sgk_ek4d_icd WHERE grup_id = g.id) AS adlar FROM sgk_ek4d_gruplar g').all();
    idler = adaylar.filter((g) => S.fonetik(`${g.baslik} ${g.ana} ${g.adlar || ''}`).includes(aranan)).map((g) => g.id).slice(0, 30);
  }
  const gruplar = gruplariGetir(idler);
  const kat = katalog(req.user.sube_id);
  for (const g of gruplar) {
    if (kod) g.icd_eslesen = g.icd.filter((x) => x.kod === kod || x.kod === kod.slice(0, 3));
    g.icd_sayisi = g.icd.length;
    g.icd = g.icd.slice(0, 40);
    // Katalogdaki uygun ilaclar (etken madde ya da ATC sinifi eslesmesi)
    const uygun = [];
    for (const r of kat) {
      const madde = g.ilaclar.find((m) => S.maddeEslesir(m.ad, r.anahtar));
      if (madde) uygun.push({ id: r.id, ad: r.ad, stok: r.stok, satis_fiyati: r.satis_fiyati, madde: madde.ad });
    }
    g.katalog = uygun.sort((a, b) => (b.stok > 0) - (a.stok > 0) || a.ad.localeCompare(b.ad, 'tr')).slice(0, 50);
  }
  res.json({ sorgu: q, kod, gruplar });
});

// Katalogdaki bir ilac icin SUT ozeti
router.get('/ilac/:id', (req, res) => {
  const ilac = db
    .prepare(
      `SELECT i.id, i.ad, i.barkod, i.etken_madde, b.depocu_fiyati, COALESCE(b.atc_kodu, t.atc_kodu) AS atc_kodu, t.atc_adi
       FROM ilaclar i LEFT JOIN ilac_bilgi b ON b.ilac_id = i.id LEFT JOIN titck_ilaclar t ON t.barkod = i.barkod WHERE i.id = ?`
    )
    .get(Number(req.params.id));
  if (!ilac) return res.status(404).json({ error: 'İlaç bulunamadı' });
  const durum = durumBilgisi();

  // EK-4/A: guncel ya da eski barkodla
  let ek4a = null;
  if (ilac.barkod) {
    ek4a =
      db.prepare('SELECT * FROM sgk_ek4a WHERE barkod = ?').get(ilac.barkod) ||
      db.prepare("SELECT * FROM sgk_ek4a WHERE ',' || eski_barkodlar || ',' LIKE ?").get(`%,${ilac.barkod},%`) ||
      null;
  }
  let iskonto = null;
  let esdegerler = [];
  if (ek4a) {
    const bt = bantlar();
    const oranlar = [ek4a.isk1, ek4a.isk2, ek4a.isk3, ek4a.isk4];
    let bant = null;
    if (ilac.depocu_fiyati != null) {
      bant = bt.findIndex((b) => (b.alt == null || ilac.depocu_fiyati >= b.alt) && (b.ust == null || ilac.depocu_fiyati <= b.ust));
      if (bant < 0) bant = null;
    }
    iskonto = { bantlar: bt.map((b, i) => ({ ...b, oran: oranlar[i] })), secili: bant, oran: bant != null ? oranlar[bant] : null };
    const bugun = yerelSimdi().toISOString().slice(0, 10);
    ek4a.aktif = !ek4a.pasif_tarihi || ek4a.pasif_tarihi > bugun;
    if (ek4a.esdeger_grup) {
      esdegerler = db
        .prepare(
          `SELECT a.barkod, a.ad, a.durum, a.pasif_tarihi, i.id AS ilac_id, COALESCE(s.stok, 0) AS stok, i.satis_fiyati
           FROM sgk_ek4a a LEFT JOIN ilaclar i ON i.barkod = a.barkod LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
           WHERE a.esdeger_grup = ? AND a.barkod <> ? ORDER BY (i.id IS NULL), a.ad LIMIT 40`
        )
        .all(req.user.sube_id, ek4a.esdeger_grup, ek4a.barkod);
    }
  }

  // EK-4/D: hangi hastaliklarda katilim payindan muaf
  const anahtar = { anahtarlar: S.etkenAnahtarlari(ilac.etken_madde, ilac.atc_adi), atc: ilac.atc_kodu };
  const maddeler = db.prepare('SELECT grup_id, no, ad, endikasyon, kosul FROM sgk_ek4d_ilaclar').all();
  const eslesen = new Map();
  for (const m of maddeler) {
    const tur = S.maddeEslesir(m.ad, anahtar);
    if (!tur) continue;
    const onceki = eslesen.get(m.grup_id);
    if (!onceki || (onceki.eslesme === 'sinif' && tur === 'etken')) eslesen.set(m.grup_id, { ...m, endikasyon: !!m.endikasyon, eslesme: tur });
  }
  const muafiyet = gruplariGetir([...eslesen.keys()]).map((g) => ({
    id: g.id, kod: g.kod, ana: g.ana, baslik: g.baslik, araliklar: g.araliklar, icd_sayisi: g.icd.length,
    icd: g.icd.slice(0, 12), madde: eslesen.get(g.id)
  }));

  // EK-4/E ve EK-4/F: etken madde metinde geciyorsa
  const kurallar = db.prepare('SELECT liste, grup, no, baslik, metin FROM sgk_kurallar').all();
  // Yalnizca madde basligi (ilac adlari) aranir; kosul metnindeki gecisler (or. "ASA ile birlikte") yanlis eslesme uretir
  const uzun = anahtar.anahtarlar.filter((a) => a.length >= 5).map((a) => a.replace(/ /g, ''));
  const kuralEslesen = uzun.length
    ? kurallar.filter((k) => {
        const f = S.fonetik(k.baslik || '').replace(/ /g, '');
        return uzun.some((a) => f.includes(a));
      })
    : [];

  res.json({
    durum,
    ilac: { id: ilac.id, ad: ilac.ad, barkod: ilac.barkod, etken_madde: ilac.etken_madde, atc_kodu: ilac.atc_kodu, depocu_fiyati: ilac.depocu_fiyati },
    anahtarlar: anahtar.anahtarlar,
    ek4a,
    iskonto,
    esdegerler,
    muafiyet,
    ek4e: kuralEslesen.filter((k) => k.liste === 'EK-4E'),
    ek4e_aciklama: kuralEslesen.some((k) => k.liste === 'EK-4E') ? ayarOku('sgk_ek4e_aciklama') : null,
    ek4f: kuralEslesen.filter((k) => k.liste === 'EK-4F')
  });
});

module.exports = router;
module.exports.sonSutIndir = sonSutIndir;
module.exports.kaydet = kaydet;
