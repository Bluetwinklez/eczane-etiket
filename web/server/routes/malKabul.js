const express = require('express');
const { db } = require('../db');
const { partiGiris } = require('../partiler');
const { gtinAnahtar, kodlariCoz, seriDurumu, hareketYaz } = require('../its');
const { dosyadanFatura } = require('../eFatura');
const { sadelestir } = require('../ilacBilgi');

const router = express.Router();
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

function yuvarla(n) {
  return Math.round(n * 100) / 100;
}

function kabulGetir(id) {
  const k = db
    .prepare(
      `SELECT mk.*, t.firma_adi AS tedarikci_adi, u.ad_soyad AS kullanici_adi
       FROM mal_kabulleri mk
       LEFT JOIN tedarikciler t ON t.id = mk.tedarikci_id
       LEFT JOIN kullanicilar u ON u.id = mk.kullanici_id
       WHERE mk.id = ?`
    )
    .get(id);
  if (!k) return null;
  k.kalemler = db
    .prepare(
      `SELECT mkk.*, i.ad AS ilac_adi FROM mal_kabul_kalemleri mkk JOIN ilaclar i ON i.id = mkk.ilac_id
       WHERE mkk.mal_kabul_id = ? ORDER BY mkk.id`
    )
    .all(id);
  return k;
}

router.get('/', (req, res) => {
  let sql = `
    SELECT mk.*, t.firma_adi AS tedarikci_adi, u.ad_soyad AS kullanici_adi,
           (SELECT COUNT(*) FROM mal_kabul_kalemleri WHERE mal_kabul_id = mk.id) AS kalem_sayisi,
           (SELECT SUM(adet + mf) FROM mal_kabul_kalemleri WHERE mal_kabul_id = mk.id) AS toplam_adet
    FROM mal_kabulleri mk
    LEFT JOIN tedarikciler t ON t.id = mk.tedarikci_id
    LEFT JOIN kullanicilar u ON u.id = mk.kullanici_id
    WHERE 1=1`;
  const params = [];
  if (req.user.rol !== 'admin') {
    sql += ' AND mk.sube_id = ?';
    params.push(req.user.sube_id);
  }
  sql += ' ORDER BY mk.id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

// e-Fatura (UBL-TR XML veya XML iceren ZIP): mal kabul formunu doldurmak icin onizleme
router.post('/e-fatura', express.raw({ type: () => true, limit: '10mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Dosya gönderilmedi' });
  let sonuc;
  try {
    sonuc = dosyadanFatura(req.body);
  } catch (err) {
    return res.status(400).json({ error: 'e-Fatura okunamadı: ' + err.message });
  }
  const { fatura, satirlar, uyarilar } = sonuc;

  // Tedarikci: once vergi no, sonra ad benzerligi (ilk iki kelime)
  const tedarikciler = db.prepare('SELECT id, firma_adi, vergi_no FROM tedarikciler').all();
  const vkn = (fatura.tedarikci.vkn || '').replace(/\D/g, '');
  const adAnahtar = sadelestir(fatura.tedarikci.ad).split(' ').slice(0, 2).join(' ');
  const ted =
    (vkn && tedarikciler.find((t) => t.vergi_no === vkn)) ||
    (adAnahtar && tedarikciler.find((t) => sadelestir(t.firma_adi).startsWith(adAnahtar) || adAnahtar.startsWith(sadelestir(t.firma_adi)))) ||
    null;
  fatura.tedarikci.eslesen = ted ? { id: ted.id, firma_adi: ted.firma_adi, vkn_ile: Boolean(vkn && ted.vergi_no === vkn) } : null;

  const mukerrer = fatura.no
    ? db.prepare('SELECT id, tarih FROM mal_kabulleri WHERE sube_id = ? AND fatura_no = ? AND (? IS NULL OR tedarikci_id = ?)').get(req.user.sube_id, fatura.no, ted ? ted.id : null, ted ? ted.id : null)
    : null;
  if (mukerrer) uyarilar.unshift(`Bu fatura (${fatura.no}) daha önce mal kabul #${mukerrer.id} ile işlenmiş.`);

  const katalog = db.prepare("SELECT id, ad, barkod, alis_fiyati FROM ilaclar").all();
  const barkodla = new Map(katalog.filter((i) => i.barkod).map((i) => [gtinAnahtar(i.barkod), i]));
  const adla = new Map(katalog.map((i) => [sadelestir(i.ad), i]));
  const titckBul = db.prepare('SELECT barkod, ad, durum FROM titck_ilaclar WHERE barkod = ?');
  for (const s of satirlar) {
    const ilac = (s.barkod && barkodla.get(gtinAnahtar(s.barkod))) || adla.get(sadelestir(s.ad)) || null;
    s.ilac_id = ilac ? ilac.id : null;
    s.ilac_adi = ilac ? ilac.ad : null;
    s.eslesme = ilac ? (s.barkod && barkodla.get(gtinAnahtar(s.barkod)) ? 'barkod' : 'ad') : null;
    s.onceki_alis = ilac ? ilac.alis_fiyati : null;
    s.titck = !ilac && s.barkod ? titckBul.get(s.barkod.padStart(13, '0').slice(-13)) || titckBul.get(s.barkod) || null : null;
  }
  res.json({ fatura, satirlar, uyarilar, mukerrer: mukerrer ? mukerrer.id : null, ozet: { satir: satirlar.length, eslesen: satirlar.filter((s) => s.ilac_id).length } });
});

router.get('/:id', (req, res) => {
  const k = kabulGetir(req.params.id);
  if (!k || (req.user.rol !== 'admin' && k.sube_id !== req.user.sube_id)) {
    return res.status(404).json({ error: 'Mal kabul bulunamadı' });
  }
  res.json(k);
});

router.post('/', (req, res) => {
  const { tedarikci_id, siparis_id, fatura_no, fatura_tarihi } = req.body;
  const alisGuncelle = req.body.alis_fiyati_guncelle !== false;
  const subeId = req.user.sube_id;

  if (tedarikci_id && !db.prepare('SELECT id FROM tedarikciler WHERE id = ?').get(tedarikci_id)) {
    return res.status(400).json({ error: 'Tedarikçi bulunamadı' });
  }
  if (fatura_tarihi && !TARIH.test(fatura_tarihi)) return res.status(400).json({ error: 'Fatura tarihi geçersiz' });

  let siparis = null;
  if (siparis_id) {
    siparis = db.prepare('SELECT * FROM siparisler WHERE id = ?').get(siparis_id);
    if (!siparis || siparis.sube_id !== subeId) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    if (!['beklemede', 'gonderildi'].includes(siparis.durum)) {
      return res.status(400).json({ error: 'Sipariş zaten sonuçlanmış' });
    }
  }

  const kalemler = Array.isArray(req.body.kalemler) ? req.body.kalemler : [];
  if (!kalemler.length) return res.status(400).json({ error: 'En az bir kalem girin' });
  const hazir = [];
  for (const k of kalemler) {
    const ilac = db.prepare('SELECT id, ad, barkod FROM ilaclar WHERE id = ?').get(Number(k.ilac_id));
    if (!ilac) return res.status(404).json({ error: `Ürün bulunamadı: ${k.ilac_id}` });
    const adet = Number(k.adet);
    const mf = Number(k.mf || 0);
    const alis = Number(k.alis_fiyati);
    if (!Number.isInteger(adet) || adet <= 0) return res.status(400).json({ error: `${ilac.ad}: adet geçersiz` });
    if (!Number.isInteger(mf) || mf < 0) return res.status(400).json({ error: `${ilac.ad}: mal fazlası geçersiz` });
    if (!Number.isFinite(alis) || alis < 0) return res.status(400).json({ error: `${ilac.ad}: alış fiyatı geçersiz` });
    if (k.skt && !TARIH.test(k.skt)) return res.status(400).json({ error: `${ilac.ad}: SKT geçersiz` });
    // Karekodlu kutular: seri no urunle eslesmeli, zaten stokta olan kutu tekrar girilemez
    const kc = kodlariCoz(k.karekodlar);
    if (kc.hata) return res.status(400).json({ error: `${ilac.ad}: ${kc.hata}` });
    for (const kod of kc.kayitlar) {
      if (gtinAnahtar(kod.gtin) !== gtinAnahtar(ilac.barkod)) {
        return res.status(400).json({ error: `${ilac.ad}: karekod (seri ${kod.seri_no}) başka bir ürüne ait` });
      }
      if (['giris', 'iade'].includes(seriDurumu(kod.gtin, kod.seri_no))) {
        return res.status(409).json({ error: `${ilac.ad}: seri ${kod.seri_no} zaten stokta görünüyor` });
      }
    }
    if (kc.kayitlar.length > adet + mf) return res.status(400).json({ error: `${ilac.ad}: karekod sayısı gelen adetten fazla` });
    hazir.push({ ilac, adet, mf, alis, birim: yuvarla((alis * adet) / (adet + mf)), parti_no: k.parti_no || null, skt: k.skt || null, karekodlar: kc.kayitlar });
  }
  const toplam = yuvarla(hazir.reduce((t, k) => t + k.alis * k.adet, 0));

  db.exec('BEGIN');
  try {
    const kabulId = Number(
      db
        .prepare(
          `INSERT INTO mal_kabulleri (sube_id, tedarikci_id, siparis_id, fatura_no, fatura_tarihi, toplam_tutar, kullanici_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(subeId, tedarikci_id || (siparis && siparis.tedarikci_id) || null, siparis ? siparis.id : null, fatura_no || null, fatura_tarihi || null, toplam, req.user.id)
        .lastInsertRowid
    );
    const kalemEkle = db.prepare(
      `INSERT INTO mal_kabul_kalemleri (mal_kabul_id, ilac_id, adet, mf, alis_fiyati, birim_maliyet, parti_no, skt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const k of hazir) {
      const giren = k.adet + k.mf;
      kalemEkle.run(kabulId, k.ilac.id, k.adet, k.mf, k.alis, k.birim, k.parti_no, k.skt);
      db.prepare(
        `INSERT INTO ilac_stok (ilac_id, sube_id, stok) VALUES (?, ?, ?)
         ON CONFLICT(ilac_id, sube_id) DO UPDATE SET stok = stok + excluded.stok`
      ).run(k.ilac.id, subeId, giren);
      partiGiris(k.ilac.id, subeId, giren, { parti_no: k.parti_no, skt: k.skt, kaynak: `mal kabul #${kabulId}` });
      db.prepare('INSERT INTO stok_hareketleri (ilac_id, sube_id, tip, adet, aciklama) VALUES (?, ?, ?, ?, ?)').run(
        k.ilac.id,
        subeId,
        'giris',
        giren,
        `Mal kabul #${kabulId}${fatura_no ? ` (fatura ${fatura_no})` : ''}${k.mf ? ` ${k.adet}+${k.mf} MF` : ''}`
      );
      for (const kod of k.karekodlar) {
        hareketYaz({ subeId, tip: 'giris', k: kod, ilacId: k.ilac.id, malKabulId: kabulId, kullaniciId: req.user.id });
      }
      // Kar hesaplari icin urunun alis fiyati MF dahil gercek birim maliyete cekilir
      if (alisGuncelle) db.prepare('UPDATE ilaclar SET alis_fiyati = ? WHERE id = ?').run(k.birim, k.ilac.id);
    }
    // e-faturadan gelen vergi no, tedarikci kaydinda yoksa eklenir (sonraki faturalarda otomatik eslesir)
    const vknYeni = String(req.body.tedarikci_vkn || '').replace(/\D/g, '');
    if (tedarikci_id && /^\d{10,11}$/.test(vknYeni)) {
      db.prepare("UPDATE tedarikciler SET vergi_no = ? WHERE id = ? AND (vergi_no IS NULL OR vergi_no = '')").run(vknYeni, tedarikci_id);
    }
    if (siparis) {
      db.prepare("UPDATE siparisler SET durum = 'teslim_alindi', teslim_tarihi = datetime('now') WHERE id = ?").run(siparis.id);
    }
    // Faturali mal kabul tedarikci cari hesabina borc olarak islenir (vade: fatura tarihi + tedarikci vade gunu)
    const tedarikciId = tedarikci_id || (siparis && siparis.tedarikci_id) || null;
    const tedarikci = tedarikciId ? db.prepare('SELECT id, vade_gun FROM tedarikciler WHERE id = ?').get(tedarikciId) : null;
    if (tedarikci && toplam > 0) {
      const belgeTarihi = fatura_tarihi || new Date().toISOString().slice(0, 10);
      const vade = new Date(new Date(belgeTarihi + 'T00:00:00Z').getTime() + (tedarikci.vade_gun ?? 30) * 86400000).toISOString().slice(0, 10);
      db.prepare(
        `INSERT INTO tedarikci_hareketleri (tedarikci_id, sube_id, tip, tutar, belge_no, belge_tarihi, vade_tarihi, aciklama, mal_kabul_id, kullanici_id)
         VALUES (?, ?, 'fatura', ?, ?, ?, ?, ?, ?, ?)`
      ).run(tedarikci.id, subeId, toplam, fatura_no || null, belgeTarihi, vade, `Mal kabul #${kabulId}`, kabulId, req.user.id);
    }
    db.exec('COMMIT');
    res.status(201).json(kabulGetir(kabulId));
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Mal kabul kaydedilemedi' });
  }
});

module.exports = router;
