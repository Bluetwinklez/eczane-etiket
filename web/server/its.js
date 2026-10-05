// Karekod (seri no) bazli kutu takibi. Bu kayitlar ITS'ye gercek bildirim yapmaz;
// eczacinin kendi ITS ekranina girecegi / yukleyecegi verinin hazirligi ve kontroludur.
const { db } = require('./db');
const { karekodCoz } = require('./karekod');

const TIP_ADI = { giris: 'Giriş', satis: 'Satış', iade: 'İade' };

// "01 + 14 hane" GTIN ile 13 haneli barkod ayni urunu gosterir: bastaki sifirlar atilarak karsilastirilir
const gtinAnahtar = (g) => String(g || '').replace(/\D/g, '').replace(/^0+/, '');

// Metin listesini cozer; seri numarasi olmayanlar (duz barkod) takip disi kalir.
// { kayitlar, hata } doner.
function kodlariCoz(kodlar) {
  if (kodlar === undefined || kodlar === null) return { kayitlar: [] };
  if (!Array.isArray(kodlar)) return { hata: 'karekodlar liste olmalı' };
  const kayitlar = [];
  const gorulen = new Set();
  for (const ham of kodlar) {
    const k = karekodCoz(ham);
    if (!k) return { hata: `Karekod okunamadı: ${String(ham).slice(0, 40)}` };
    if (!k.seri_no) return { hata: `Karekodda seri no yok: ${String(ham).slice(0, 40)}` };
    const anahtar = `${gtinAnahtar(k.gtin)}|${k.seri_no}`;
    if (gorulen.has(anahtar)) return { hata: `Aynı karekod iki kez gönderildi (seri ${k.seri_no})` };
    gorulen.add(anahtar);
    kayitlar.push(k);
  }
  return { kayitlar };
}

// Bir serinin son durumu: 'giris' | 'satis' | 'iade' | null (hic gorulmedi)
function seriDurumu(gtin, seriNo) {
  const satirlar = db.prepare('SELECT tip, gtin FROM karekod_hareketleri WHERE seri_no = ? ORDER BY id DESC').all(seriNo);
  const anahtar = gtinAnahtar(gtin);
  const son = satirlar.find((r) => gtinAnahtar(r.gtin) === anahtar);
  return son ? son.tip : null;
}

// Sepet / mal kabul kalemleriyle eslesme kontrolu icin ilac bulur
function ilacBul(k) {
  const anahtar = gtinAnahtar(k.gtin);
  return db
    .prepare("SELECT id, ad, barkod FROM ilaclar WHERE barkod IS NOT NULL AND barkod != ''")
    .all()
    .find((i) => gtinAnahtar(i.barkod) === anahtar) || null;
}

function hareketYaz({ subeId, tip, k, ilacId, satisId, malKabulId, iadeId, kullaniciId }) {
  db.prepare(
    `INSERT INTO karekod_hareketleri (sube_id, tip, ilac_id, gtin, seri_no, parti_no, skt, satis_id, mal_kabul_id, iade_id, kullanici_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(subeId, tip, ilacId || null, k.gtin, k.seri_no, k.parti_no || null, k.skt || null, satisId || null, malKabulId || null, iadeId || null, kullaniciId || null);
}

module.exports = { TIP_ADI, gtinAnahtar, kodlariCoz, seriDurumu, ilacBul, hareketYaz };
