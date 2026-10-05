// Muhasebe ozeti: hasilat, iadeler, maliyet, gider, alis faturalari, brut/net kazanc ve kasa raporlari.
// Satis saatleri DB'de UTC tutulur; gunler yerel takvime (zaman.js) gore sayilir.
const express = require('express');
const { db } = require('../db');
const { requireRole } = require('../auth');
const { sendCsv, sendPdf } = require('../export');
const { sqlSaatFarki, yerelSimdi } = require('../zaman');
const { cariBakiye, acikFaturalar } = require('./tedarikciler');

const router = express.Router();
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const y2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const gunSql = (alan) => `date(${alan}, '${sqlSaatFarki()}')`;

function yerelBugun() {
  return yerelSimdi().toISOString().slice(0, 10);
}

// Varsayilan donem: icinde bulunulan ayin basindan bugune
function donemOku(req) {
  const bugun = yerelBugun();
  const bas = req.query.baslangic || bugun.slice(0, 8) + '01';
  const bit = req.query.bitis || bugun;
  if (!TARIH.test(bas) || !TARIH.test(bit)) return { hata: 'Tarihler YYYY-AA-GG biçiminde olmalı' };
  if (bas > bit) return { hata: 'Başlangıç tarihi bitişten sonra olamaz' };
  return { bas, bit };
}

function subeOku(req) {
  const q = Number(req.query.sube_id);
  if (req.user.rol === 'admin' && Number.isInteger(q) && q > 0) return q;
  return req.user.sube_id;
}

// ---- Hesaplamalar ----
function satisToplamlari(subeId, bas, bit) {
  const satis = db
    .prepare(
      `SELECT COUNT(*) AS adet, COALESCE(SUM(toplam_tutar), 0) AS ciro
       FROM satislar WHERE sube_id = ? AND ${gunSql('tarih')} BETWEEN ? AND ?`
    )
    .get(subeId, bas, bit);
  const maliyet = db
    .prepare(
      `SELECT COALESCE(SUM(k.alis_fiyati * k.adet), 0) AS m
       FROM satis_kalemleri k JOIN satislar s ON s.id = k.satis_id
       WHERE s.sube_id = ? AND ${gunSql('s.tarih')} BETWEEN ? AND ?`
    )
    .get(subeId, bas, bit).m;
  const iade = db
    .prepare(
      `SELECT COUNT(*) AS adet, COALESCE(SUM(toplam_tutar), 0) AS tutar
       FROM iadeler WHERE sube_id = ? AND ${gunSql('tarih')} BETWEEN ? AND ?`
    )
    .get(subeId, bas, bit);
  // Stoga geri alinan iadenin maliyeti dusulur; stoga alinmayan (fire) iadenin maliyeti zarar olarak kalir
  const iadeMaliyet = db
    .prepare(
      `SELECT COALESCE(SUM(ik.alis_fiyati * ik.adet), 0) AS m
       FROM iade_kalemleri ik JOIN iadeler i ON i.id = ik.iade_id
       WHERE i.sube_id = ? AND i.stoga_alindi = 1 AND ${gunSql('i.tarih')} BETWEEN ? AND ?`
    )
    .get(subeId, bas, bit).m;
  return {
    satis_adedi: satis.adet,
    brut_hasilat: y2(satis.ciro),
    iade_adedi: iade.adet,
    iade_tutari: y2(iade.tutar),
    maliyet: y2(maliyet - iadeMaliyet)
  };
}

function giderToplamlari(subeId, bas, bit) {
  const satirlar = db
    .prepare('SELECT kategori, COALESCE(SUM(tutar), 0) AS toplam FROM giderler WHERE sube_id = ? AND tarih BETWEEN ? AND ? GROUP BY kategori')
    .all(subeId, bas, bit);
  const kategoriler = {};
  let isletme = 0;
  let tedarik = 0;
  for (const s of satirlar) {
    kategoriler[s.kategori] = y2(s.toplam);
    // Tedarik giderleri mal alimidir; maliyet (SMM) zaten satis anindaki alis fiyatindan duser, cifte sayilmasin
    if (s.kategori === 'tedarik') tedarik += s.toplam;
    else isletme += s.toplam;
  }
  return { kategoriler, isletme_giderleri: y2(isletme), tedarik_giderleri: y2(tedarik) };
}

function alisToplamlari(subeId, bas, bit) {
  const tarihAlani = "COALESCE(belge_tarihi, date(tarih))";
  const r = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN tip = 'fatura' THEN tutar END), 0) AS fatura,
         COALESCE(SUM(CASE WHEN tip = 'fatura' THEN 1 END), 0) AS fatura_adedi,
         COALESCE(SUM(CASE WHEN tip = 'odeme' AND odeme_sekli = 'iade' THEN tutar END), 0) AS alis_iadesi,
         COALESCE(SUM(CASE WHEN tip = 'odeme' AND COALESCE(odeme_sekli, '') != 'iade' THEN tutar END), 0) AS odeme
       FROM tedarikci_hareketleri WHERE sube_id = ? AND ${tarihAlani} BETWEEN ? AND ?`
    )
    .get(subeId, bas, bit);
  return {
    alis_faturalari: y2(r.fatura),
    alis_fatura_adedi: r.fatura_adedi,
    alis_iadeleri: y2(r.alis_iadesi),
    net_alis: y2(r.fatura - r.alis_iadesi),
    tedarikci_odemeleri: y2(r.odeme)
  };
}

function borcDurumu(subeId) {
  const bugun = yerelBugun();
  let borc = 0;
  let gecikmis = 0;
  for (const t of db.prepare('SELECT id FROM tedarikciler').all()) {
    borc += Math.max(cariBakiye(t.id, subeId), 0);
    for (const f of acikFaturalar(t.id, subeId)) {
      const vade = f.vade_tarihi || f.belge_tarihi || f.tarih.slice(0, 10);
      if (vade < bugun) gecikmis += f.kalan;
    }
  }
  const veresiye = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN tip = 'borc' THEN tutar ELSE -tutar END), 0) AS b FROM cari_hareketler WHERE sube_id = ? OR sube_id IS NULL`
    )
    .get(subeId).b;
  return { tedarikci_borcu: y2(borc), vadesi_gecmis_borc: y2(gecikmis), veresiye_alacagi: y2(Math.max(veresiye, 0)) };
}

function ozetHesapla(subeId, bas, bit) {
  const s = satisToplamlari(subeId, bas, bit);
  const g = giderToplamlari(subeId, bas, bit);
  const a = alisToplamlari(subeId, bas, bit);
  const netHasilat = y2(s.brut_hasilat - s.iade_tutari);
  const brutKar = y2(netHasilat - s.maliyet);
  const netKar = y2(brutKar - g.isletme_giderleri);
  return {
    baslangic: bas,
    bitis: bit,
    ...s,
    net_hasilat: netHasilat,
    brut_kar: brutKar,
    brut_marj: netHasilat > 0 ? y2((brutKar / netHasilat) * 100) : 0,
    ...g,
    net_kar: netKar,
    net_marj: netHasilat > 0 ? y2((netKar / netHasilat) * 100) : 0,
    ...a,
    ...borcDurumu(subeId)
  };
}

// Gunluk kazanc tablosu
function gunlukHesapla(subeId, bas, bit) {
  const gunler = {};
  const gun = (t) => (gunler[t] ||= { tarih: t, satis_adedi: 0, brut_hasilat: 0, iade_tutari: 0, maliyet: 0, gider: 0 });

  for (const r of db
    .prepare(
      `SELECT ${gunSql('tarih')} AS g, COUNT(*) AS adet, SUM(toplam_tutar) AS ciro FROM satislar
       WHERE sube_id = ? AND ${gunSql('tarih')} BETWEEN ? AND ? GROUP BY g`
    )
    .all(subeId, bas, bit)) {
    gun(r.g).satis_adedi = r.adet;
    gun(r.g).brut_hasilat = r.ciro;
  }
  for (const r of db
    .prepare(
      `SELECT ${gunSql('s.tarih')} AS g, SUM(k.alis_fiyati * k.adet) AS m FROM satis_kalemleri k JOIN satislar s ON s.id = k.satis_id
       WHERE s.sube_id = ? AND ${gunSql('s.tarih')} BETWEEN ? AND ? GROUP BY g`
    )
    .all(subeId, bas, bit)) {
    gun(r.g).maliyet += r.m;
  }
  for (const r of db
    .prepare(
      `SELECT ${gunSql('tarih')} AS g, SUM(toplam_tutar) AS t FROM iadeler
       WHERE sube_id = ? AND ${gunSql('tarih')} BETWEEN ? AND ? GROUP BY g`
    )
    .all(subeId, bas, bit)) {
    gun(r.g).iade_tutari = r.t;
  }
  for (const r of db
    .prepare(
      `SELECT ${gunSql('i.tarih')} AS g, SUM(ik.alis_fiyati * ik.adet) AS m FROM iade_kalemleri ik JOIN iadeler i ON i.id = ik.iade_id
       WHERE i.sube_id = ? AND i.stoga_alindi = 1 AND ${gunSql('i.tarih')} BETWEEN ? AND ? GROUP BY g`
    )
    .all(subeId, bas, bit)) {
    gun(r.g).maliyet -= r.m;
  }
  for (const r of db
    .prepare("SELECT tarih AS g, SUM(tutar) AS t FROM giderler WHERE sube_id = ? AND kategori != 'tedarik' AND tarih BETWEEN ? AND ? GROUP BY g")
    .all(subeId, bas, bit)) {
    gun(r.g).gider = r.t;
  }

  return Object.values(gunler)
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
    .map((g) => {
      const net = g.brut_hasilat - g.iade_tutari;
      const brut = net - g.maliyet;
      return {
        tarih: g.tarih,
        satis_adedi: g.satis_adedi,
        brut_hasilat: y2(g.brut_hasilat),
        iade_tutari: y2(g.iade_tutari),
        net_hasilat: y2(net),
        maliyet: y2(g.maliyet),
        brut_kar: y2(brut),
        gider: y2(g.gider),
        net_kar: y2(brut - g.gider)
      };
    });
}

// Kasa raporu: gunluk odeme kirilimi (nakit/kart/SGK/veresiye), tahsilat, iade, kasa giris-cikis
function kasaHesapla(subeId, bas, bit) {
  const gunler = {};
  const bos = (t) => ({ tarih: t, nakit: 0, kart: 0, sgk: 0, veresiye: 0, tahsilat: 0, iade: 0, kasa_giris: 0, kasa_cikis: 0 });
  const gun = (t) => (gunler[t] ||= bos(t));
  const alanOf = (tip) => (tip === 'nakit' ? 'nakit' : tip === 'sgk' ? 'sgk' : tip === 'veresiye' ? 'veresiye' : 'kart');

  for (const r of db
    .prepare(
      `SELECT ${gunSql('tarih')} AS g, odeme_tipi, SUM(toplam_tutar) AS t FROM satislar
       WHERE sube_id = ? AND ${gunSql('tarih')} BETWEEN ? AND ? AND odeme_tipi != 'karma' GROUP BY g, odeme_tipi`
    )
    .all(subeId, bas, bit)) {
    gun(r.g)[alanOf(r.odeme_tipi)] += r.t;
  }
  for (const r of db
    .prepare(
      `SELECT ${gunSql('sa.tarih')} AS g, so.odeme_tipi, SUM(so.tutar) AS t FROM satis_odemeleri so JOIN satislar sa ON sa.id = so.satis_id
       WHERE sa.sube_id = ? AND ${gunSql('sa.tarih')} BETWEEN ? AND ? GROUP BY g, so.odeme_tipi`
    )
    .all(subeId, bas, bit)) {
    gun(r.g)[alanOf(r.odeme_tipi)] += r.t;
  }
  for (const r of db
    .prepare(
      `SELECT ${gunSql('tarih')} AS g, odeme_tipi, SUM(tutar) AS t FROM cari_hareketler
       WHERE tip = 'tahsilat' AND sube_id = ? AND ${gunSql('tarih')} BETWEEN ? AND ? GROUP BY g, odeme_tipi`
    )
    .all(subeId, bas, bit)) {
    const d = gun(r.g);
    d.tahsilat += r.t;
    d[r.odeme_tipi === 'kredi_karti' ? 'kart' : 'nakit'] += r.t;
  }
  for (const r of db
    .prepare(
      `SELECT ${gunSql('tarih')} AS g, odeme_tipi, SUM(toplam_tutar) AS t FROM iadeler
       WHERE sube_id = ? AND ${gunSql('tarih')} BETWEEN ? AND ? AND odeme_tipi != 'karma' GROUP BY g, odeme_tipi`
    )
    .all(subeId, bas, bit)) {
    const d = gun(r.g);
    d.iade += r.t;
    d[alanOf(r.odeme_tipi)] -= r.t;
  }
  for (const r of db
    .prepare(
      `SELECT ${gunSql('i.tarih')} AS g, i.toplam_tutar AS t,
              (SELECT COALESCE(SUM(tutar), 0) FROM satis_odemeleri WHERE satis_id = i.satis_id AND odeme_tipi = 'nakit') AS nakit,
              (SELECT COALESCE(SUM(tutar), 0) FROM satis_odemeleri WHERE satis_id = i.satis_id) AS toplam
       FROM iadeler i WHERE i.sube_id = ? AND ${gunSql('i.tarih')} BETWEEN ? AND ? AND i.odeme_tipi = 'karma'`
    )
    .all(subeId, bas, bit)) {
    const nakitPay = r.toplam ? y2(r.t * (r.nakit / r.toplam)) : 0;
    const d = gun(r.g);
    d.iade += r.t;
    d.nakit -= nakitPay;
    d.kart -= r.t - nakitPay;
  }
  for (const r of db
    .prepare(
      `SELECT ${gunSql('tarih')} AS g, tip, SUM(tutar) AS t FROM kasa_hareketleri
       WHERE sube_id = ? AND ${gunSql('tarih')} BETWEEN ? AND ? GROUP BY g, tip`
    )
    .all(subeId, bas, bit)) {
    gun(r.g)[r.tip === 'giris' ? 'kasa_giris' : 'kasa_cikis'] += r.t;
  }

  const kapanislar = Object.fromEntries(
    db.prepare('SELECT tarih, fark FROM kasa_kapanislari WHERE sube_id = ? AND tarih BETWEEN ? AND ?').all(subeId, bas, bit).map((k) => [k.tarih, k.fark])
  );

  return Object.values(gunler)
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
    .map((d) => {
      const satirlar = {};
      for (const [k, v] of Object.entries(d)) satirlar[k] = k === 'tarih' ? v : y2(v);
      satirlar.ciro = y2(d.nakit + d.kart + d.sgk + d.veresiye - d.tahsilat);
      satirlar.beklenen_nakit = y2(d.nakit + d.kasa_giris - d.kasa_cikis);
      satirlar.kasa_farki = d.tarih in kapanislar ? y2(kapanislar[d.tarih]) : null;
      return satirlar;
    });
}

function faturalarHesapla(subeId, bas, bit) {
  const kalanlar = {};
  for (const t of db.prepare('SELECT id FROM tedarikciler').all()) {
    for (const f of acikFaturalar(t.id, subeId)) kalanlar[f.id] = f.kalan;
  }
  const bugun = yerelBugun();
  return db
    .prepare(
      `SELECT h.*, t.firma_adi FROM tedarikci_hareketleri h JOIN tedarikciler t ON t.id = h.tedarikci_id
       WHERE h.sube_id = ? AND COALESCE(h.belge_tarihi, date(h.tarih)) BETWEEN ? AND ?
       ORDER BY COALESCE(h.belge_tarihi, date(h.tarih)) DESC, h.id DESC`
    )
    .all(subeId, bas, bit)
    .map((h) => {
      const iade = h.tip === 'odeme' && h.odeme_sekli === 'iade';
      const tur = h.tip === 'fatura' ? 'Fatura' : iade ? 'Alış iadesi' : 'Ödeme';
      const kalan = h.tip === 'fatura' ? y2(kalanlar[h.id] || 0) : null;
      const vade = h.vade_tarihi || null;
      let durum = '';
      if (h.tip === 'fatura') durum = kalan <= 0.005 ? 'Ödendi' : vade && vade < bugun ? 'Vadesi geçti' : 'Açık';
      return {
        id: h.id,
        tarih: h.belge_tarihi || h.tarih.slice(0, 10),
        tur,
        firma_adi: h.firma_adi,
        belge_no: h.belge_no || '',
        vade_tarihi: vade || '',
        tutar: y2(h.tutar),
        kalan,
        durum,
        aciklama: h.aciklama || ''
      };
    });
}

// ---- Cikti yardimcilari ----
function cikti(req, res, ad, baslik, satirlar, kolonlar) {
  const format = req.query.format || 'json';
  if (format === 'csv') sendCsv(res, ad + '.csv', satirlar, kolonlar);
  else if (format === 'pdf') sendPdf(res, ad + '.pdf', baslik, satirlar, kolonlar);
  else return false;
  return true;
}

const GUNLUK_KOLON = [
  { baslik: 'Tarih', alan: 'tarih' },
  { baslik: 'Satış', alan: 'satis_adedi' },
  { baslik: 'Brüt hasılat', alan: 'brut_hasilat' },
  { baslik: 'İade', alan: 'iade_tutari' },
  { baslik: 'Net hasılat', alan: 'net_hasilat' },
  { baslik: 'Maliyet', alan: 'maliyet' },
  { baslik: 'Brüt kâr', alan: 'brut_kar' },
  { baslik: 'Gider', alan: 'gider' },
  { baslik: 'Net kâr', alan: 'net_kar' }
];
const KASA_KOLON = [
  { baslik: 'Tarih', alan: 'tarih' },
  { baslik: 'Nakit', alan: 'nakit' },
  { baslik: 'Kart', alan: 'kart' },
  { baslik: 'SGK', alan: 'sgk' },
  { baslik: 'Veresiye', alan: 'veresiye' },
  { baslik: 'Tahsilat', alan: 'tahsilat' },
  { baslik: 'İade', alan: 'iade' },
  { baslik: 'Kasa giriş', alan: 'kasa_giris' },
  { baslik: 'Kasa çıkış', alan: 'kasa_cikis' },
  { baslik: 'Beklenen nakit', alan: 'beklenen_nakit' },
  { baslik: 'Kasa farkı', alan: 'kasa_farki' }
];
const FATURA_KOLON = [
  { baslik: 'Tarih', alan: 'tarih' },
  { baslik: 'Tür', alan: 'tur' },
  { baslik: 'Firma', alan: 'firma_adi' },
  { baslik: 'Belge no', alan: 'belge_no' },
  { baslik: 'Vade', alan: 'vade_tarihi' },
  { baslik: 'Tutar', alan: 'tutar' },
  { baslik: 'Kalan', alan: 'kalan' },
  { baslik: 'Durum', alan: 'durum' }
];
const OZET_ETIKETLERI = [
  ['brut_hasilat', 'Brüt hasılat (satışlar)'],
  ['iade_tutari', 'Müşteri iadeleri'],
  ['net_hasilat', 'Net hasılat'],
  ['maliyet', 'Satılan malın maliyeti'],
  ['brut_kar', 'Brüt kâr'],
  ['isletme_giderleri', 'İşletme giderleri'],
  ['net_kar', 'Net kâr'],
  ['alis_faturalari', 'Alış faturaları'],
  ['alis_iadeleri', 'Alış iadeleri'],
  ['net_alis', 'Net alış'],
  ['tedarikci_odemeleri', 'Tedarikçi ödemeleri'],
  ['tedarikci_borcu', 'Tedarikçi borcu (güncel)'],
  ['vadesi_gecmis_borc', 'Vadesi geçmiş borç'],
  ['veresiye_alacagi', 'Veresiye alacağı (güncel)']
];

// ---- Rotalar ----
router.get('/ozet', (req, res) => {
  const d = donemOku(req);
  if (d.hata) return res.status(400).json({ error: d.hata });
  const ozet = ozetHesapla(subeOku(req), d.bas, d.bit);
  const satirlar = OZET_ETIKETLERI.map(([alan, etiket]) => ({ kalem: etiket, tutar: ozet[alan] }));
  const c = cikti(req, res, `muhasebe-ozet-${d.bas}_${d.bit}`, `Muhasebe özeti ${d.bas} – ${d.bit}`, satirlar, [
    { baslik: 'Kalem', alan: 'kalem' },
    { baslik: 'Tutar (TL)', alan: 'tutar' }
  ]);
  if (!c) res.json(ozet);
});

router.get('/gunluk', (req, res) => {
  const d = donemOku(req);
  if (d.hata) return res.status(400).json({ error: d.hata });
  const satirlar = gunlukHesapla(subeOku(req), d.bas, d.bit);
  if (!cikti(req, res, `gunluk-kazanc-${d.bas}_${d.bit}`, `Günlük kazanç ${d.bas} – ${d.bit}`, satirlar, GUNLUK_KOLON)) res.json(satirlar);
});

router.get('/kasa', (req, res) => {
  const d = donemOku(req);
  if (d.hata) return res.status(400).json({ error: d.hata });
  const satirlar = kasaHesapla(subeOku(req), d.bas, d.bit);
  if (!cikti(req, res, `kasa-raporu-${d.bas}_${d.bit}`, `Kasa raporu ${d.bas} – ${d.bit}`, satirlar, KASA_KOLON)) res.json(satirlar);
});

router.get('/faturalar', (req, res) => {
  const d = donemOku(req);
  if (d.hata) return res.status(400).json({ error: d.hata });
  const satirlar = faturalarHesapla(subeOku(req), d.bas, d.bit);
  if (!cikti(req, res, `alis-faturalari-${d.bas}_${d.bit}`, `Alış faturaları ${d.bas} – ${d.bit}`, satirlar, FATURA_KOLON)) res.json(satirlar);
});

// Alis iadesi (tedarikciye mal iadesi / iade faturasi): cari borcu azaltir, nakit odeme sayilmaz
router.post('/alis-iadesi', requireRole('admin', 'eczaci'), (req, res) => {
  const t = db.prepare('SELECT * FROM tedarikciler WHERE id = ?').get(req.body.tedarikci_id);
  if (!t) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });
  const tutar = y2(req.body.tutar);
  if (!(tutar > 0)) return res.status(400).json({ error: 'Geçerli bir tutar girin' });
  const belgeTarihi = req.body.belge_tarihi || yerelBugun();
  if (!TARIH.test(belgeTarihi)) return res.status(400).json({ error: 'Belge tarihi geçersiz' });
  const info = db
    .prepare(
      `INSERT INTO tedarikci_hareketleri (tedarikci_id, sube_id, tip, tutar, belge_no, belge_tarihi, odeme_sekli, aciklama, kullanici_id)
       VALUES (?, ?, 'odeme', ?, ?, ?, 'iade', ?, ?)`
    )
    .run(t.id, req.user.sube_id, tutar, req.body.belge_no || null, belgeTarihi, req.body.aciklama || 'Alış iadesi', req.user.id);
  res.status(201).json({ id: info.lastInsertRowid, bakiye: cariBakiye(t.id, req.user.sube_id) });
});

module.exports = router;
module.exports.ozetHesapla = ozetHesapla;
module.exports.gunlukHesapla = gunlukHesapla;
module.exports.kasaHesapla = kasaHesapla;
