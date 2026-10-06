// Ilac karti (sekmeli bilgi), ilac tespit (tablet gorunumuyle bulma), kategori gezgini,
// kamu fiyati / tablet bilgisi CSV ice aktarma.
const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { csvAyristir } = require('../csvIceAktar');
const { URUN_TIPLERI } = require('../sabitler');
const { maddeleriAyir } = require('../etkilesim');
const B = require('../ilacBilgi');
const { yerelSimdi } = require('../zaman');
const { atcAnaGrup } = require('../titck');

const router = express.Router();
const yonetici = requireRole('admin', 'eczaci');
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

const BILGI_BOS = {
  atc_kodu: null, endikasyon: null, tablet_renk: null, tablet_sekil: null, tablet_yazi: null, tablet_centik: null, tablet_seffaf: 0,
  imalatci_fiyati: null, depocu_fiyati: null, kamu_fiyati: null, kamu_odenecek: null, kurum_iskontosu: null, sgk_kapsaminda: 0,
  sut_notu: null, kub_url: null, kt_url: null, derma_ana: null, derma_alt: null
};

const bugun = () => yerelSimdi().toISOString().slice(0, 10);

function stoklu(subeId, kosul = '', params = []) {
  return db
    .prepare(
      `SELECT i.id, i.ad, i.barkod, i.kategori, i.uretici, i.urun_tipi, i.etken_madde, i.receteli, i.satis_fiyati,
              COALESCE(s.stok, 0) AS stok, b.atc_kodu, b.endikasyon, b.tablet_renk, b.tablet_sekil, b.tablet_yazi, b.tablet_centik, b.tablet_seffaf,
              b.kamu_fiyati, b.kamu_odenecek, b.sgk_kapsaminda, b.derma_ana, b.derma_alt
       FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       LEFT JOIN ilac_bilgi b ON b.ilac_id = i.id
       ${kosul}
       ORDER BY i.ad`
    )
    .all(subeId, ...params);
}

// ---- Ilac tespit: renk / sekil / yazi / ATC / endikasyon / centik / seffaflik ----
router.get('/tespit', (req, res) => {
  const q = req.query;
  const diziOku = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map((x) => B.kucuk(x)).filter(Boolean);
  const renkler = diziOku(q.renk);
  const yazilar = diziOku(q.yazi);
  const sekil = B.kucuk(q.sekil);
  const centik = B.kucuk(q.centik);
  const atc = String(q.atc || '').trim().toUpperCase();
  const endikasyon = B.kucuk(q.endikasyon);
  const seffaf = q.seffaf === '1';
  if (renkler.length > 2) return res.status(400).json({ error: 'En fazla iki renk seçilebilir' });
  if (renkler.some((r) => !B.RENKLER.includes(r))) return res.status(400).json({ error: 'Geçersiz renk' });
  if (sekil && !B.SEKILLER.includes(sekil)) return res.status(400).json({ error: 'Geçersiz şekil' });
  if (centik && !B.CENTIKLER.includes(centik)) return res.status(400).json({ error: 'Geçersiz çentik seçimi' });
  if (!renkler.length && !yazilar.length && !sekil && !centik && !atc && !endikasyon && !seffaf) {
    return res.status(400).json({ error: 'En az bir özellik seçin (metin, şekil, renk, ATC/endikasyon, çentik)' });
  }

  const uygun = stoklu(req.user.sube_id, 'WHERE b.ilac_id IS NOT NULL').filter((r) => {
    const rr = (r.tablet_renk || '').split(',');
    if (renkler.some((x) => !rr.includes(x))) return false;
    if (sekil && r.tablet_sekil !== sekil) return false;
    if (centik && r.tablet_centik !== centik) return false;
    if (seffaf && !r.tablet_seffaf) return false;
    if (atc && !(r.atc_kodu || '').toUpperCase().startsWith(atc)) return false;
    if (endikasyon && !B.kucuk(r.endikasyon).includes(endikasyon)) return false;
    const yazi = B.kucuk(r.tablet_yazi);
    return yazilar.every((y) => yazi.includes(y));
  });
  res.json({ toplam: uygun.length, sonuclar: uygun.slice(0, 50), renkler: B.RENKLER, sekiller: B.SEKILLER });
});

// ---- Kategori gezgini (dermokozmetik / bakim urunleri icin kategori + marka suzgeci) ----
router.get('/gezgin', (req, res) => {
  const q = req.query;
  const tum = stoklu(req.user.sube_id);
  const ara = B.kucuk(q.q);
  const temel = tum.filter(
    (r) =>
      (!q.tip || r.urun_tipi === q.tip) &&
      (!q.ana || r.derma_ana === q.ana) &&
      (!q.alt || r.derma_alt === q.alt) &&
      (q.stokta !== '1' || r.stok > 0) &&
      (!ara || B.kucuk(r.ad).includes(ara) || (r.barkod || '').includes(q.q) || B.kucuk(r.uretici).includes(ara))
  );
  const sayim = (liste, alan) => {
    const m = new Map();
    for (const r of liste) if (r[alan]) m.set(r[alan], (m.get(r[alan]) || 0) + 1);
    return [...m].map(([ad, adet]) => ({ ad, adet })).sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, 'tr'));
  };
  // Her kutu kendi suzgecini haric tutarak sayilir (secili kategori diger kategorilerin sayisini yok etmesin)
  const kategoriSecili = (r) => !q.kategori || r.kategori === q.kategori;
  const markaSecili = (r) => !q.marka || r.uretici === q.marka;
  const sonuc = temel.filter((r) => kategoriSecili(r) && markaSecili(r));
  const sirala = q.sirala;
  if (sirala === 'fiyat_artan') sonuc.sort((a, b) => a.satis_fiyati - b.satis_fiyati);
  else if (sirala === 'fiyat_azalan') sonuc.sort((a, b) => b.satis_fiyati - a.satis_fiyati);
  else if (sirala === 'stok') sonuc.sort((a, b) => b.stok - a.stok);
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 48));
  const offset = Math.max(0, Number(q.offset) || 0);
  const tipSayim = new Map();
  for (const r of tum) tipSayim.set(r.urun_tipi, (tipSayim.get(r.urun_tipi) || 0) + 1);
  res.json({
    toplam: sonuc.length,
    urunler: sonuc.slice(offset, offset + limit),
    kategoriler: sayim(temel.filter(markaSecili), 'kategori'),
    markalar: sayim(temel.filter(kategoriSecili), 'uretici'),
    tipler: [...tipSayim].map(([tip, adet]) => ({ tip, ad: URUN_TIPLERI[tip] || tip, adet }))
  });
});

// ---- Dermokozmetik kategori agaci (adetleriyle) ve otomatik siniflandirma ----
router.get('/derma-agaci', (req, res) => {
  const sayim = new Map();
  for (const r of db.prepare('SELECT derma_ana, derma_alt FROM ilac_bilgi WHERE derma_ana IS NOT NULL').all()) {
    sayim.set(r.derma_ana, (sayim.get(r.derma_ana) || 0) + 1);
    sayim.set(r.derma_ana + '|' + r.derma_alt, (sayim.get(r.derma_ana + '|' + r.derma_alt) || 0) + 1);
  }
  const siniflanmamis = db
    .prepare("SELECT COUNT(*) AS c FROM ilaclar i LEFT JOIN ilac_bilgi b ON b.ilac_id = i.id WHERE i.urun_tipi = 'dermokozmetik' AND b.derma_ana IS NULL")
    .get().c;
  res.json({
    siniflanmamis,
    agac: Object.entries(B.DERMA_AGACI).map(([ana, altlar]) => ({
      ana,
      adet: sayim.get(ana) || 0,
      altlar: altlar.map((alt) => ({ alt, adet: sayim.get(ana + '|' + alt) || 0 }))
    }))
  });
});

router.post('/derma-siniflandir', yonetici, (req, res) => {
  const adaylar = db
    .prepare(
      `SELECT i.id, i.ad FROM ilaclar i LEFT JOIN ilac_bilgi b ON b.ilac_id = i.id
       WHERE i.urun_tipi = 'dermokozmetik' AND b.derma_ana IS NULL ORDER BY i.ad`
    )
    .all();
  const oneriler = adaylar.map((u) => ({ ...u, tahmin: B.dermaTahmin(u.ad) }));
  const atanacak = oneriler.filter((o) => o.tahmin);
  if (!req.body.onizleme) {
    db.exec('BEGIN');
    try {
      const ekle = db.prepare('INSERT OR IGNORE INTO ilac_bilgi (ilac_id) VALUES (?)');
      const yaz = db.prepare("UPDATE ilac_bilgi SET derma_ana = ?, derma_alt = ?, guncelleme = datetime('now') WHERE ilac_id = ?");
      for (const o of atanacak) {
        ekle.run(o.id);
        yaz.run(o.tahmin.ana, o.tahmin.alt, o.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: 'Sınıflandırma kaydedilemedi' });
    }
  }
  res.json({ atanan: atanacak.length, atanamayan: oneriler.length - atanacak.length, oneriler });
});

// ---- Mustahzar karsilastirma (2-4 urun yan yana) ----
router.get('/karsilastir', (req, res) => {
  const idler = [...new Set((Array.isArray(req.query.id) ? req.query.id : [req.query.id]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (idler.length < 2 || idler.length > 4) return res.status(400).json({ error: 'Karşılaştırmak için 2 ile 4 arasında ürün seçin' });
  const urunler = [];
  for (const id of idler) {
    const r = stoklu(req.user.sube_id, 'WHERE i.id = ?', [id])[0];
    if (!r) return res.status(404).json({ error: `Ürün bulunamadı: ${id}` });
    const t = r.barkod ? db.prepare('SELECT durum, atc_kodu, atc_adi, recete_turu FROM titck_ilaclar WHERE barkod = ?').get(r.barkod) : null;
    const hm = B.hastaMaliyeti({ psf: r.satis_fiyati, kamuFiyati: r.kamu_fiyati, kamuOdenecek: r.kamu_odenecek, hasta: 'aktif' });
    urunler.push({
      id: r.id, ad: r.ad, barkod: r.barkod, firma: r.uretici, kategori: r.kategori, urun_tipi: r.urun_tipi,
      etken_madde: r.etken_madde, atc_kodu: r.atc_kodu || (t && t.atc_kodu) || null, atc_adi: t && t.atc_adi,
      satis_fiyati: r.satis_fiyati, kamu_fiyati: r.kamu_fiyati, fiyat_farki: r.kamu_fiyati ? Math.max(0, B.yuvarla(r.satis_fiyati - r.kamu_fiyati)) : null,
      hasta_oder: hm ? hm.hasta_oder : null, stok: r.stok, receteli: r.receteli, titck_durum: t ? t.durum : null,
      sgk: r.sgk_kapsaminda ? 1 : 0, gorunum: [r.tablet_renk, r.tablet_sekil, r.tablet_yazi].filter(Boolean).join(' · ') || null
    });
  }
  const enUcuz = Math.min(...urunler.map((u) => u.satis_fiyati));
  res.json(urunler.map((u) => ({ ...u, en_ucuz: u.satis_fiyati === enUcuz })));
});

// ---- Kamu fiyati / tablet bilgisi CSV ice aktarma (barkod ile eslesir) ----
const anahtar = (m) =>
  String(m || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
const SUTUNLAR = {
  barkod: ['barkod', 'barcode', 'gtin', 'ean'],
  atc_kodu: ['atc', 'atckodu'],
  endikasyon: ['endikasyon'],
  tablet_renk: ['renk', 'tabletrenk'],
  tablet_sekil: ['sekil', 'tabletsekil'],
  tablet_yazi: ['yazi', 'metin', 'tabletyazi'],
  tablet_centik: ['centik', 'tabletcentik'],
  tablet_seffaf: ['seffaf', 'tabletseffaf'],
  imalatci_fiyati: ['isf', 'imalatcifiyati'],
  depocu_fiyati: ['dsf', 'depocufiyati'],
  psf: ['psf', 'perakende', 'perakendesatisfiyati'],
  kamu_fiyati: ['kf', 'kamufiyati'],
  kamu_odenecek: ['ko', 'kamuodenecek'],
  kurum_iskontosu: ['ki', 'kurumiskontosu'],
  sgk_kapsaminda: ['sgk', 'sgkkapsaminda'],
  sut_notu: ['sut', 'sutnotu'],
  kub_url: ['kub', 'kubbaglantisi'],
  kt_url: ['kt', 'ktbaglantisi'],
  tarih: ['tarih', 'fiyattarihi']
};
const SAYISAL = ['imalatci_fiyati', 'depocu_fiyati', 'psf', 'kamu_fiyati', 'kamu_odenecek', 'kurum_iskontosu'];
const BOOL = (v) => ['1', 'evet', 'var', 'true', 'e'].includes(B.kucuk(v));

function satirCoz(deger, alan) {
  const v = deger === undefined ? '' : String(deger).trim();
  if (SAYISAL.includes(alan)) {
    const n = B.sayiOku(v);
    return Number.isNaN(n) ? { hata: `${alan} sayı olmalı` } : { deger: n };
  }
  if (alan === 'tablet_renk') return B.listeOku(v, B.RENKLER, 'renk');
  if (alan === 'tablet_sekil') {
    const s = B.kucuk(v);
    return s && !B.SEKILLER.includes(s) ? { hata: `Geçersiz şekil: ${s}` } : { deger: s || null };
  }
  if (alan === 'tablet_centik') {
    const s = B.kucuk(v);
    return s && !B.CENTIKLER.includes(s) ? { hata: `Geçersiz çentik: ${s}` } : { deger: s || null };
  }
  if (alan === 'tablet_seffaf' || alan === 'sgk_kapsaminda') return { deger: v ? (BOOL(v) ? 1 : 0) : null };
  if (alan === 'kub_url' || alan === 'kt_url') {
    const u = B.urlOku(v);
    return Number.isNaN(u) ? { hata: `${alan} http(s) bağlantısı olmalı` } : { deger: u };
  }
  if (alan === 'tarih') return v && !TARIH.test(v) ? { hata: 'Tarih YYYY-AA-GG olmalı' } : { deger: v || null };
  return { deger: v || null };
}

const FIYAT_ALANLARI = [['imalatci_fiyati', 'isf'], ['depocu_fiyati', 'dsf'], ['psf', 'psf'], ['kamu_fiyati', 'kf'], ['kamu_odenecek', 'ko'], ['kurum_iskontosu', 'ki']];

router.post('/ice-aktar', yonetici, (req, res) => {
  if (typeof req.body.csv !== 'string' || !req.body.csv.trim()) return res.status(400).json({ error: 'CSV içeriği boş' });
  const tablo = csvAyristir(req.body.csv);
  if (tablo.length < 2) return res.status(400).json({ error: 'Başlık satırı ve en az bir veri satırı gerekli' });
  if (tablo.length > 5001) return res.status(400).json({ error: 'Tek seferde en fazla 5000 satır' });

  const sutunIndeks = {};
  tablo[0].forEach((b, i) => {
    const k = anahtar(b);
    for (const [alan, adlar] of Object.entries(SUTUNLAR)) if (adlar.includes(k) && sutunIndeks[alan] === undefined) sutunIndeks[alan] = i;
  });
  if (sutunIndeks.barkod === undefined) return res.status(400).json({ error: 'Barkod sütunu bulunamadı (barkod / GTIN)' });

  const barkodla = db.prepare('SELECT id, ad FROM ilaclar WHERE barkod = ?');
  const plan = tablo.slice(1).map((h, i) => {
    const satir = { satir: i + 2, barkod: String(h[sutunIndeks.barkod] || '').trim(), hatalar: [], alanlar: {}, islem: 'guncelle' };
    const ilac = barkodla.get(satir.barkod);
    if (!ilac) {
      satir.islem = 'bulunamadi';
      return satir;
    }
    satir.ilac_id = ilac.id;
    satir.ad = ilac.ad;
    for (const [alan, idx] of Object.entries(sutunIndeks)) {
      if (alan === 'barkod') continue;
      const c = satirCoz(h[idx], alan);
      if (c.hata) satir.hatalar.push(c.hata);
      else if (c.deger !== null && c.deger !== undefined) satir.alanlar[alan] = c.deger;
    }
    if (satir.hatalar.length) satir.islem = 'hata';
    else if (!Object.keys(satir.alanlar).length) satir.islem = 'bos';
    return satir;
  });
  const ozet = { guncellenecek: 0, bulunamadi: 0, hata: 0, bos: 0 };
  for (const p of plan) {
    if (p.islem === 'guncelle') ozet.guncellenecek += 1;
    else ozet[p.islem] += 1;
  }
  if (req.body.onizleme) return res.json({ ozet, satirlar: plan.slice(0, 200), taninan: Object.keys(sutunIndeks) });
  if (ozet.hata) return res.status(400).json({ error: `${ozet.hata} satırda hata var; önce düzeltin`, ozet, satirlar: plan.filter((p) => p.islem === 'hata') });

  const bilgiAlanlari = Object.keys(BILGI_BOS);
  db.exec('BEGIN');
  try {
    for (const p of plan.filter((x) => x.islem === 'guncelle')) {
      db.prepare('INSERT OR IGNORE INTO ilac_bilgi (ilac_id) VALUES (?)').run(p.ilac_id);
      const set = Object.keys(p.alanlar).filter((a) => bilgiAlanlari.includes(a));
      if (set.length) {
        db.prepare(`UPDATE ilac_bilgi SET ${set.map((a) => `${a} = ?`).join(', ')}, guncelleme = datetime('now') WHERE ilac_id = ?`).run(
          ...set.map((a) => p.alanlar[a]),
          p.ilac_id
        );
      }
      fiyatHareketiYaz(p.ilac_id, p.alanlar, p.alanlar.tarih || bugun(), 'ice aktarma');
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'İçe aktarma başarısız: ' + err.message });
  }
  res.json({ ozet, satirlar: plan.slice(0, 200) });
});

// Fiyat alanlarindan biri son kayittan farkliysa yeni hareket satiri eklenir
function fiyatHareketiYaz(ilacId, alanlar, tarih, kaynak) {
  const yeni = {};
  for (const [kolon, kisa] of FIYAT_ALANLARI) if (alanlar[kolon] !== undefined && alanlar[kolon] !== null) yeni[kisa] = alanlar[kolon];
  if (!Object.keys(yeni).length) return false;
  const son = db.prepare('SELECT * FROM fiyat_hareketleri WHERE ilac_id = ? ORDER BY tarih DESC, id DESC LIMIT 1').get(ilacId) || {};
  const birlesik = { isf: son.isf ?? null, dsf: son.dsf ?? null, psf: son.psf ?? null, kf: son.kf ?? null, ko: son.ko ?? null, ki: son.ki ?? null, ...yeni };
  if (Object.keys(yeni).every((k) => son[k] === yeni[k])) return false;
  db.prepare('INSERT INTO fiyat_hareketleri (ilac_id, tarih, isf, dsf, psf, kf, ko, ki, kaynak) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    ilacId, tarih, birlesik.isf, birlesik.dsf, birlesik.psf, birlesik.kf, birlesik.ko, birlesik.ki, kaynak
  );
  return true;
}

// ---- Ilac karti ----
function etkinMaddeler(deger) {
  return maddeleriAyir(deger);
}

router.get('/:id', (req, res) => {
  const ilac = stoklu(req.user.sube_id, 'WHERE i.id = ?', [Number(req.params.id)])[0];
  if (!ilac) return res.status(404).json({ error: 'İlaç bulunamadı' });
  const bilgi = { ...BILGI_BOS, ...(db.prepare('SELECT * FROM ilac_bilgi WHERE ilac_id = ?').get(ilac.id) || {}) };
  delete bilgi.ilac_id;

  const hareketler = db
    .prepare('SELECT tarih, isf, dsf, psf, kf, ko, ki, kaynak FROM fiyat_hareketleri WHERE ilac_id = ? ORDER BY tarih DESC, id DESC')
    .all(ilac.id);
  // Satis fiyati degisiklikleri de fiyat hareketi olarak gorunur
  const satisDegisimleri = db.prepare('SELECT tarih, yeni_fiyat FROM fiyat_gecmisi WHERE ilac_id = ? ORDER BY tarih DESC, id DESC').all(ilac.id);
  for (const g of satisDegisimleri) hareketler.push({ tarih: g.tarih.slice(0, 10), isf: null, dsf: null, psf: g.yeni_fiyat, kf: null, ko: null, ki: null, kaynak: 'satış fiyatı' });
  hareketler.sort((a, b) => b.tarih.localeCompare(a.tarih));
  // FF: fiyat farki (PSF'nin kamu fiyatini asan kismi); ayni satirda ikisi de varsa hesaplanir
  for (const h of hareketler) h.ff = h.psf != null && h.kf != null ? Math.max(0, Math.round((h.psf - h.kf) * 100) / 100) : null;
  // Bir onceki kayda gore artis/dusus
  const psfSerisi = hareketler.filter((h) => h.psf != null);
  hareketler.forEach((h) => {
    const idx = psfSerisi.indexOf(h);
    const onceki = idx >= 0 ? psfSerisi[idx + 1] : null;
    h.psf_yon = onceki ? (h.psf > onceki.psf ? 'artis' : h.psf < onceki.psf ? 'dusus' : null) : null;
  });

  const titck = (ilac.barkod && db.prepare('SELECT barkod, ad, atc_kodu, atc_adi, firma, recete_turu, durum, temel_ilac FROM titck_ilaclar WHERE barkod = ?').get(ilac.barkod)) || null;
  const atc = bilgi.atc_kodu || (titck && titck.atc_kodu) || null;

  // Esdeger: ATC kodu (ayni etken madde, 5. seviye) varsa o, yoksa etken madde metni esas alinir
  const anah = (m) => etkinMaddeler(m).map((x) => x.toLocaleLowerCase('tr-TR')).sort().join('+');
  const hedef = anah(ilac.etken_madde);
  const katalogAtc = new Map(db.prepare('SELECT ilac_id, atc_kodu FROM ilac_bilgi WHERE atc_kodu IS NOT NULL').all().map((r) => [r.ilac_id, r.atc_kodu]));
  const ayniEtken = (r) => (atc && katalogAtc.get(r.id) ? katalogAtc.get(r.id) === atc : hedef && anah(r.etken_madde) === hedef);
  const esdegerler = atc || hedef
    ? stoklu(req.user.sube_id)
        .filter((r) => r.id !== ilac.id && ayniEtken(r))
        .map((r) => ({
          id: r.id, ad: r.ad, barkod: r.barkod, uretici: r.uretici, stok: r.stok, satis_fiyati: r.satis_fiyati, kamu_fiyati: r.kamu_fiyati,
          fiyat_farki: Math.round((r.satis_fiyati - ilac.satis_fiyati) * 100) / 100
        }))
        .sort((a, b) => (b.stok > 0) - (a.stok > 0) || a.satis_fiyati - b.satis_fiyati)
    : [];
  // Katalogda olmayan ama TITCK listesinde ayni ATC kodlu aktif urunler
  const titckEsdegerler = atc
    ? db
        .prepare(
          `SELECT t.barkod, t.ad, t.firma, t.recete_turu FROM titck_ilaclar t
           WHERE t.atc_kodu = ? AND t.durum = 'aktif' AND t.barkod != ?
             AND NOT EXISTS (SELECT 1 FROM ilaclar i WHERE i.barkod = t.barkod)
           ORDER BY t.ad LIMIT 60`
        )
        .all(atc, ilac.barkod || '')
    : [];

  const etkilesimler = etkinMaddeler(ilac.etken_madde);
  res.json({
    ilac: { ...ilac, tablet_renk: undefined },
    bilgi,
    etkin_maddeler: etkilesimler,
    hareketler,
    esdegerler,
    esdeger_kaynagi: atc ? `ATC ${atc}` : hedef ? 'etken madde' : null,
    titck: titck && { ...titck, atc_grubu: atcAnaGrup(titck.atc_kodu) },
    titck_esdegerler: titckEsdegerler,
    atc_kodu: atc,
    hasta_maliyeti: B.hastaMaliyeti({ psf: ilac.satis_fiyati, kamuFiyati: bilgi.kamu_fiyati, kamuOdenecek: bilgi.kamu_odenecek, hasta: 'aktif' }),
    secenekler: { renkler: B.RENKLER, sekiller: B.SEKILLER, centikler: B.CENTIKLER, derma: B.DERMA_AGACI }
  });
});

// Urun ailesi: ayni markanin hat -> doz -> ambalaj agaci (katalog + TITCK listesi)
router.get('/:id/aile', (req, res) => {
  const ilac = db.prepare('SELECT id, ad, barkod FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!ilac) return res.status(404).json({ error: 'İlaç bulunamadı' });
  const marka = B.urunAdiCoz(ilac.ad).marka;
  const anahtar = B.sadelestir(marka);
  if (!anahtar) return res.json({ marka, hatlar: [] });
  const ilk = (ad) => B.sadelestir(String(ad).split(/\s+/)[0].replace(/[()]/g, ''));
  const katalog = stoklu(req.user.sube_id).filter((r) => ilk(r.ad) === anahtar);
  const titck = db
    .prepare('SELECT barkod, ad, durum, recete_turu FROM titck_ilaclar WHERE ad LIKE ?')
    .all(marka.replace(/[%_]/g, '') + '%')
    .filter((t) => ilk(t.ad) === anahtar && t.durum === 'aktif');
  const kayitlar = new Map();
  for (const r of katalog) kayitlar.set(r.barkod || 'id:' + r.id, { id: r.id, barkod: r.barkod, ad: r.ad, stok: r.stok, satis_fiyati: r.satis_fiyati, katalogda: true, sgk: Boolean(r.sgk_kapsaminda), secili: r.id === ilac.id });
  for (const t of titck) if (!kayitlar.has(t.barkod)) kayitlar.set(t.barkod, { id: null, barkod: t.barkod, ad: t.ad, stok: 0, katalogda: false, sgk: false, secili: false });
  const hatlar = new Map();
  for (const k of kayitlar.values()) {
    const c = B.urunAdiCoz(k.ad);
    const hatAnahtar = B.sadelestir(c.hat);
    if (!hatlar.has(hatAnahtar)) hatlar.set(hatAnahtar, { hat: c.hat, dozlar: new Map() });
    const dozlar = hatlar.get(hatAnahtar).dozlar;
    const doz = c.doz || '—';
    if (!dozlar.has(doz)) dozlar.set(doz, []);
    dozlar.get(doz).push({ ...k, ambalaj: c.ambalaj || k.ad });
  }
  const sirala = (a, b) => a.localeCompare(b, 'tr', { numeric: true });
  res.json({
    marka,
    hatlar: [...hatlar.values()]
      .sort((a, b) => sirala(a.hat, b.hat))
      .map((h) => ({
        hat: h.hat,
        dozlar: [...h.dozlar.entries()].sort((a, b) => sirala(a[0], b[0])).map(([doz, urunler]) => ({ doz, urunler: urunler.sort((a, b) => sirala(a.ambalaj, b.ambalaj)) }))
      }))
  });
});

router.get('/:id/hasta-maliyet', (req, res) => {
  const ilac = db.prepare('SELECT id, satis_fiyati FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!ilac) return res.status(404).json({ error: 'İlaç bulunamadı' });
  const bilgi = db.prepare('SELECT kamu_fiyati, kamu_odenecek FROM ilac_bilgi WHERE ilac_id = ?').get(ilac.id);
  const adet = Number(req.query.adet || 1);
  if (!Number.isInteger(adet) || adet < 1 || adet > 99) return res.status(400).json({ error: 'Adet 1-99 arasında olmalı' });
  const hasta = req.query.hasta || 'aktif';
  if (!(hasta in B.KATILIM_ORANLARI)) return res.status(400).json({ error: 'Geçersiz hasta türü' });
  const sonuc = bilgi && B.hastaMaliyeti({ psf: ilac.satis_fiyati, kamuFiyati: bilgi.kamu_fiyati, kamuOdenecek: bilgi.kamu_odenecek, adet, hasta });
  if (!sonuc) return res.status(409).json({ error: 'Bu ürün için kamu fiyatı girilmemiş; önce ilaç kartından veya CSV ile ekleyin' });
  res.json({ ...sonuc, uyari: 'Tahmini hesaptır; katılım payı oranları mevzuata göre değişebilir.' });
});

router.put('/:id', yonetici, (req, res) => {
  const ilac = db.prepare('SELECT id FROM ilaclar WHERE id = ?').get(req.params.id);
  if (!ilac) return res.status(404).json({ error: 'İlaç bulunamadı' });
  const b = req.body || {};
  const yeni = {};
  const hata = (m) => res.status(400).json({ error: m });

  for (const alan of ['imalatci_fiyati', 'depocu_fiyati', 'kamu_fiyati', 'kamu_odenecek', 'kurum_iskontosu']) {
    if (!(alan in b)) continue;
    const n = B.sayiOku(b[alan]);
    if (Number.isNaN(n)) return hata(`${alan} geçerli bir sayı olmalı`);
    yeni[alan] = n;
  }
  if ('tablet_renk' in b) {
    const r = B.listeOku(Array.isArray(b.tablet_renk) ? b.tablet_renk.join(',') : b.tablet_renk, B.RENKLER, 'renk');
    if (r.hata) return hata(r.hata);
    if (r.deger && r.deger.split(',').length > 2) return hata('En fazla iki renk girilebilir');
    yeni.tablet_renk = r.deger;
  }
  if ('tablet_sekil' in b) {
    const s = B.kucuk(b.tablet_sekil);
    if (s && !B.SEKILLER.includes(s)) return hata('Geçersiz şekil');
    yeni.tablet_sekil = s || null;
  }
  if ('tablet_centik' in b) {
    const s = B.kucuk(b.tablet_centik);
    if (s && !B.CENTIKLER.includes(s)) return hata('Geçersiz çentik');
    yeni.tablet_centik = s || null;
  }
  for (const alan of ['kub_url', 'kt_url']) {
    if (!(alan in b)) continue;
    const u = B.urlOku(b[alan]);
    if (Number.isNaN(u)) return hata(`${alan} http:// veya https:// ile başlamalı`);
    yeni[alan] = u;
  }
  for (const [alan, uzunluk] of [['atc_kodu', 10], ['endikasyon', 300], ['tablet_yazi', 60], ['sut_notu', 4000]]) {
    if (alan in b) yeni[alan] = String(b[alan] || '').trim().slice(0, uzunluk) || null;
  }
  if ('atc_kodu' in yeni && yeni.atc_kodu) {
    yeni.atc_kodu = yeni.atc_kodu.toUpperCase();
    if (!/^[A-Z]\d{2}([A-Z]([A-Z]\d{0,2})?)?$/.test(yeni.atc_kodu) && !/^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(yeni.atc_kodu)) return hata('ATC kodu geçersiz (örn. N02BE01)');
  }
  for (const alan of ['tablet_seffaf', 'sgk_kapsaminda']) if (alan in b) yeni[alan] = b[alan] ? 1 : 0;
  if ('derma_ana' in b || 'derma_alt' in b) {
    const ana = b.derma_ana || null;
    const alt = b.derma_alt || null;
    if (ana && !B.DERMA_AGACI[ana]) return hata('Geçersiz dermokozmetik kategorisi');
    if (alt && (!ana || !B.DERMA_AGACI[ana].includes(alt))) return hata('Alt kategori seçilen ana kategoriye ait değil');
    yeni.derma_ana = ana;
    yeni.derma_alt = alt;
  }

  db.exec('BEGIN');
  try {
    db.prepare('INSERT OR IGNORE INTO ilac_bilgi (ilac_id) VALUES (?)').run(ilac.id);
    const set = Object.keys(yeni);
    if (set.length) {
      db.prepare(`UPDATE ilac_bilgi SET ${set.map((a) => `${a} = ?`).join(', ')}, guncelleme = datetime('now') WHERE ilac_id = ?`).run(...set.map((a) => yeni[a]), ilac.id);
    }
    // Fiyat alanlari degistiyse fiyat hareketine de islenir
    fiyatHareketiYaz(ilac.id, { imalatci_fiyati: yeni.imalatci_fiyati, depocu_fiyati: yeni.depocu_fiyati, kamu_fiyati: yeni.kamu_fiyati, kamu_odenecek: yeni.kamu_odenecek, kurum_iskontosu: yeni.kurum_iskontosu },
      bugun(), 'elle giriş');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Kaydedilemedi' });
  }
  res.json({ ...BILGI_BOS, ...db.prepare('SELECT * FROM ilac_bilgi WHERE ilac_id = ?').get(ilac.id) });
});

module.exports = router;
module.exports.fiyatHareketiYaz = fiyatHareketiYaz;
