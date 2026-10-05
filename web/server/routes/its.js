// Karekod hareket defteri, ITS hazirlik dosyasi ve ITS stok listesi karsilastirma.
// Bu modul ITS/TITCK servislerine baglanmaz; eczacinin kendi ITS ekranindan aldigi
// veya girecegi bilgilerle sistem kayitlarini kiyaslamasina yardim eder.
const express = require('express');
const { db } = require('../db');
const { sendCsv, sendPdf } = require('../export');
const { sqlSaatFarki, yerelSimdi } = require('../zaman');
const { TIP_ADI, gtinAnahtar } = require('../its');
const { karekodCoz } = require('../karekod');

const router = express.Router();
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const gunSql = `date(h.tarih, '${sqlSaatFarki()}')`;

function subeOku(req) {
  const q = Number(req.query.sube_id);
  return req.user.rol === 'admin' && Number.isInteger(q) && q > 0 ? q : req.user.sube_id;
}

function belgeAdi(h) {
  if (h.satis_id && h.tip === 'satis') return `Satış #${h.satis_id}`;
  if (h.iade_id) return `İade #${h.iade_id} (Satış #${h.satis_id})`;
  if (h.mal_kabul_id) return `Mal kabul #${h.mal_kabul_id}`;
  return '';
}

const KOLONLAR = [
  { baslik: 'Tarih', alan: 'tarih' },
  { baslik: 'İşlem', alan: 'islem' },
  { baslik: 'GTIN', alan: 'gtin' },
  { baslik: 'Seri no', alan: 'seri_no' },
  { baslik: 'Parti', alan: 'parti_no' },
  { baslik: 'SKT', alan: 'skt' },
  { baslik: 'Ürün', alan: 'ilac_adi' },
  { baslik: 'Belge', alan: 'belge' }
];

function hareketleriGetir(subeId, { bas, bit, tip, seri }) {
  let sql = `SELECT h.*, i.ad AS ilac_adi FROM karekod_hareketleri h LEFT JOIN ilaclar i ON i.id = h.ilac_id
             WHERE h.sube_id = ? AND ${gunSql} BETWEEN ? AND ?`;
  const params = [subeId, bas, bit];
  if (tip) {
    sql += ' AND h.tip = ?';
    params.push(tip);
  }
  if (seri) {
    sql += ' AND h.seri_no = ?';
    params.push(seri);
  }
  sql += ' ORDER BY h.id DESC LIMIT 5000';
  return db
    .prepare(sql)
    .all(...params)
    .map((h) => ({
      id: h.id,
      tarih: h.tarih.slice(0, 16).replace('T', ' '),
      tip: h.tip,
      islem: TIP_ADI[h.tip],
      gtin: h.gtin,
      seri_no: h.seri_no,
      parti_no: h.parti_no || '',
      skt: h.skt || '',
      ilac_adi: h.ilac_adi || '',
      belge: belgeAdi(h)
    }));
}

router.get('/hareketler', (req, res) => {
  const bugun = yerelSimdi().toISOString().slice(0, 10);
  const bas = req.query.baslangic || bugun.slice(0, 8) + '01';
  const bit = req.query.bitis || bugun;
  if (!TARIH.test(bas) || !TARIH.test(bit)) return res.status(400).json({ error: 'Tarihler YYYY-AA-GG biçiminde olmalı' });
  if (req.query.tip && !TIP_ADI[req.query.tip]) return res.status(400).json({ error: 'Geçersiz işlem tipi' });
  const satirlar = hareketleriGetir(subeOku(req), { bas, bit, tip: req.query.tip, seri: req.query.seri_no });
  const ad = `its-hareket-defteri-${bas}_${bit}`;
  if (req.query.format === 'csv') return sendCsv(res, ad + '.csv', satirlar, KOLONLAR);
  if (req.query.format === 'pdf') return sendPdf(res, ad + '.pdf', `Karekod hareket defteri ${bas} – ${bit}`, satirlar, KOLONLAR);
  const sayim = { giris: 0, satis: 0, iade: 0 };
  for (const s of satirlar) sayim[s.tip] += 1;
  res.json({ baslangic: bas, bitis: bit, sayim, satirlar });
});

// Bir kutunun (seri no) tum gecmisi
router.get('/seri', (req, res) => {
  const k = karekodCoz(req.query.kod);
  const seriNo = k ? k.seri_no : String(req.query.seri_no || '');
  if (!seriNo) return res.status(400).json({ error: 'Karekod veya seri no girin' });
  const gtin = k ? gtinAnahtar(k.gtin) : req.query.gtin ? gtinAnahtar(req.query.gtin) : null;
  const satirlar = hareketleriGetir(subeOku(req), { bas: '2000-01-01', bit: '2999-12-31', seri: seriNo }).filter(
    (s) => !gtin || gtinAnahtar(s.gtin) === gtin
  );
  res.json({ seri_no: seriNo, durum: satirlar.length ? satirlar[0].tip : null, satirlar });
});

// ---- ITS stok listesi ile sistem stogunu karsilastirma ----
function ayiracBul(satir) {
  const adaylar = [';', '\t', ','];
  return adaylar.map((a) => [a, satir.split(a).length]).sort((x, y) => y[1] - x[1])[0][0];
}

// "GTIN;Adet" benzeri metni cozer; adet kolonu yoksa her satir bir kutu sayilir
function itsListesiCoz(metin) {
  const satirlar = String(metin || '').replace(/^﻿/, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!satirlar.length) return { hata: 'Liste boş' };
  const ayirac = ayiracBul(satirlar[0]);
  const hucreler = satirlar.map((s) => s.split(ayirac).map((h) => h.trim().replace(/^"|"$/g, '')));
  const ilk = hucreler[0];
  let gtinKol = ilk.findIndex((h) => /gtin|barkod/i.test(h));
  let adetKol = ilk.findIndex((h) => /adet|miktar|stok/i.test(h));
  let baslikVar = gtinKol !== -1;
  if (!baslikVar) {
    // Basliksiz liste: ilk kolon GTIN, ikinci kolon sayisal ise adet
    gtinKol = 0;
    adetKol = ilk.length > 1 && /^\d{1,6}$/.test(ilk[1]) ? 1 : -1;
  }
  const toplam = new Map();
  let gecersiz = 0;
  for (const h of hucreler.slice(baslikVar ? 1 : 0)) {
    const gtin = gtinAnahtar(h[gtinKol]);
    if (!/^\d{8,14}$/.test(gtin)) {
      gecersiz += 1;
      continue;
    }
    let adet = 1;
    if (adetKol !== -1) {
      adet = Number(String(h[adetKol] || '').replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(adet) || adet < 0) {
        gecersiz += 1;
        continue;
      }
    }
    toplam.set(gtin, (toplam.get(gtin) || 0) + adet);
  }
  if (!toplam.size) return { hata: 'Listede geçerli GTIN/barkod bulunamadı' };
  return { toplam, gecersiz };
}

router.post('/karsilastir', (req, res) => {
  const cozum = itsListesiCoz(req.body.metin);
  if (cozum.hata) return res.status(400).json({ error: cozum.hata });
  const subeId = subeOku(req);
  const sistem = db
    .prepare(
      `SELECT i.id, i.ad, i.barkod, COALESCE(s.stok, 0) AS stok FROM ilaclar i
       LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       WHERE i.barkod IS NOT NULL AND i.barkod != ''`
    )
    .all(subeId);

  const satirlar = [];
  const gorulen = new Set();
  for (const u of sistem) {
    const anahtar = gtinAnahtar(u.barkod);
    const its = cozum.toplam.get(anahtar) || 0;
    if (its === 0 && u.stok === 0) continue;
    gorulen.add(anahtar);
    satirlar.push({ gtin: anahtar, ilac_adi: u.ad, its_adet: its, sistem_adet: u.stok, fark: its - u.stok });
  }
  for (const [gtin, adet] of cozum.toplam) {
    if (!gorulen.has(gtin) && !sistem.some((u) => gtinAnahtar(u.barkod) === gtin)) {
      satirlar.push({ gtin, ilac_adi: '(sistemde kayıtlı değil)', its_adet: adet, sistem_adet: 0, fark: adet });
    }
  }
  for (const s of satirlar) {
    s.durum = s.ilac_adi.startsWith('(') ? 'tanimsiz' : s.fark === 0 ? 'eslesiyor' : s.fark > 0 ? 'its_fazla' : 'sistem_fazla';
  }
  // Once farkli olanlar, en buyuk fark basta
  satirlar.sort((a, b) => (a.durum === 'eslesiyor') - (b.durum === 'eslesiyor') || Math.abs(b.fark) - Math.abs(a.fark));
  const ozet = { toplam: satirlar.length, eslesen: 0, its_fazla: 0, sistem_fazla: 0, tanimsiz: 0, gecersiz_satir: cozum.gecersiz };
  for (const s of satirlar) ozet[s.durum === 'eslesiyor' ? 'eslesen' : s.durum] += 1;
  res.json({ ozet, satirlar });
});

module.exports = router;
module.exports.itsListesiCoz = itsListesiCoz;
