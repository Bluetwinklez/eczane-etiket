// Akilli uyarilar ve oneriler: stok bitis tahmini, SKT indirim onerisi, olu stok ve gun sonu ozeti.
// Hepsi mevcut satis/stok/parti verisinden hesaplanir; yeni tablo gerektirmez.
const { db } = require('./db');
const { stokYeterlilik } = require('./stokAnaliz');
const { sqlSaatFarki, yerelSimdi } = require('./zaman');

const yuvarla = (n) => Math.round((n || 0) * 100) / 100;
const SIN = { bitmek_uzere: 8, skt_indirim: 8, olu_stok: 3 };

// Stogu 5 gunden az yetecek (ya da bitmis ama satilan) urunler; en acil olan basta
function bitmekUzere(subeId, gun = 5) {
  return stokYeterlilik(subeId)
    .filter((r) => r.son_satis > 0 && r.yetecek_gun !== null && r.yetecek_gun <= gun)
    .sort((a, b) => a.yetecek_gun - b.yetecek_gun || b.gunluk_ortalama - a.gunluk_ortalama)
    .map((r) => ({
      ilac_id: r.ilac_id,
      ad: r.ad,
      stok: r.stok,
      yetecek_gun: r.yetecek_gun,
      gunluk_ortalama: r.gunluk_ortalama,
      onerilen_adet: Math.max(1, Math.ceil(r.gunluk_ortalama * 30) - r.stok),
      durum: r.stok === 0 ? 'bitti' : r.yetecek_gun <= 1 ? 'yarin_biter' : 'yakinda'
    }));
}

// Partinin SKT'sine kadar beklenen satisi miktarin altindaysa fazlasi icin indirim onerilir
function indirimYuzdesi(kalanGun) {
  if (kalanGun <= 30) return 30;
  if (kalanGun <= 60) return 20;
  return 10;
}

function sktIndirim(subeId, bugun, pencere = 90) {
  const hiz = new Map(stokYeterlilik(subeId).map((r) => [r.ilac_id, r.gunluk_ortalama]));
  const partiler = db
    .prepare(
      `SELECT p.id, p.ilac_id, i.ad, i.alis_fiyati, i.satis_fiyati, p.parti_no, p.skt, p.miktar
       FROM ilac_partileri p JOIN ilaclar i ON i.id = p.ilac_id
       WHERE p.sube_id = ? AND p.miktar > 0 AND p.skt IS NOT NULL AND p.skt <= date(?, ?)
       ORDER BY p.skt`
    )
    .all(subeId, bugun, `+${pencere} days`);
  const gunFarki = (skt) => Math.round((Date.parse(skt + 'T00:00:00Z') - Date.parse(bugun + 'T00:00:00Z')) / 86400000);
  const sonuc = [];
  for (const p of partiler) {
    const kalan = gunFarki(p.skt);
    if (kalan < 0) {
      sonuc.push({ ...ozet(p, kalan), tur: 'dolmus', fazla: p.miktar, onerilen_indirim: null, tahmini_zarar: yuvarla(p.miktar * p.alis_fiyati) });
      continue;
    }
    const beklenen = Math.floor((hiz.get(p.ilac_id) || 0) * kalan);
    const fazla = p.miktar - beklenen;
    if (fazla <= 0) continue;
    const yuzde = indirimYuzdesi(kalan);
    sonuc.push({
      ...ozet(p, kalan),
      tur: 'yaklasan',
      fazla,
      onerilen_indirim: yuzde,
      indirimli_fiyat: yuvarla(p.satis_fiyati * (1 - yuzde / 100)),
      tahmini_zarar: yuvarla(fazla * p.alis_fiyati)
    });
  }
  // Suresi dolmuslar once, sonra en cok zarar riski olanlar
  return sonuc.sort((a, b) => (a.tur === 'dolmus' ? -1 : 0) - (b.tur === 'dolmus' ? -1 : 0) || b.tahmini_zarar - a.tahmini_zarar);
}

function ozet(p, kalan) {
  return { parti_id: p.id, ilac_id: p.ilac_id, ad: p.ad, parti_no: p.parti_no, skt: p.skt, kalan_gun: kalan, miktar: p.miktar, satis_fiyati: p.satis_fiyati };
}

function oluStok(subeId, gun = 90) {
  const satirlar = db
    .prepare(
      `SELECT i.id AS ilac_id, i.ad, s.stok, ROUND(s.stok * i.alis_fiyati, 2) AS bagli_sermaye
       FROM ilac_stok s JOIN ilaclar i ON i.id = s.ilac_id
       WHERE s.sube_id = ? AND s.stok > 0
         AND NOT EXISTS (SELECT 1 FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
                          WHERE sk.ilac_id = i.id AND sa.sube_id = s.sube_id AND sa.tarih >= datetime('now', ?))
       ORDER BY bagli_sermaye DESC`
    )
    .all(subeId, `-${gun} days`);
  return {
    gun,
    adet: satirlar.length,
    bagli_sermaye: yuvarla(satirlar.reduce((t, r) => t + r.bagli_sermaye, 0)),
    ilk: satirlar.slice(0, SIN.olu_stok)
  };
}

function gunSonu(subeId, bugun) {
  const fark = sqlSaatFarki();
  const s = db
    .prepare(
      `SELECT COUNT(*) AS adet, COALESCE(SUM(toplam_tutar), 0) AS ciro FROM satislar
       WHERE sube_id = ? AND date(tarih, ?) = ?`
    )
    .get(subeId, fark, bugun);
  const kar = db
    .prepare(
      `SELECT COALESCE(SUM(sk.ara_toplam - sk.adet * COALESCE(sk.alis_fiyati, 0)), 0) AS kar
       FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
       WHERE sa.sube_id = ? AND date(sa.tarih, ?) = ?`
    )
    .get(subeId, fark, bugun).kar;
  const dun = db
    .prepare(`SELECT COALESCE(SUM(toplam_tutar), 0) AS ciro FROM satislar WHERE sube_id = ? AND date(tarih, ?) = date(?, '-1 day')`)
    .get(subeId, fark, bugun).ciro;
  const eniyi = db
    .prepare(
      `SELECT sk.ilac_adi AS ad, SUM(sk.adet) AS adet FROM satis_kalemleri sk JOIN satislar sa ON sa.id = sk.satis_id
       WHERE sa.sube_id = ? AND date(sa.tarih, ?) = ? GROUP BY sk.ilac_id ORDER BY adet DESC LIMIT 1`
    )
    .get(subeId, fark, bugun);
  return {
    tarih: bugun,
    satis_adedi: s.adet,
    ciro: yuvarla(s.ciro),
    kar: yuvarla(kar),
    dun_ciro: yuvarla(dun),
    en_cok_satan: eniyi || null
  };
}

function oneriler(subeId) {
  const bugun = yerelSimdi().toISOString().slice(0, 10);
  const bitiyor = bitmekUzere(subeId);
  const skt = sktIndirim(subeId, bugun);
  const olu = oluStok(subeId);
  const gs = gunSonu(subeId, bugun);
  // Ozet cumleleri: web ve mobilde ayni metin gosterilir
  const mesajlar = [];
  if (bitiyor.length) {
    mesajlar.push({ tur: 'stok', onem: bitiyor.some((b) => b.durum !== 'yakinda') ? 'yuksek' : 'orta', metin: `${bitiyor.length} ürünün stoğu 5 günden az yetecek`, hedef: 'siparis' });
  }
  const dolmus = skt.filter((s) => s.tur === 'dolmus');
  if (dolmus.length) mesajlar.push({ tur: 'skt', onem: 'yuksek', metin: `${dolmus.length} partinin son kullanma tarihi geçmiş`, hedef: 'skt' });
  const yaklasan = skt.filter((s) => s.tur === 'yaklasan');
  if (yaklasan.length) {
    const zarar = yuvarla(yaklasan.reduce((t, s) => t + s.tahmini_zarar, 0));
    mesajlar.push({ tur: 'skt', onem: 'orta', metin: `${yaklasan.length} partide SKT öncesi satılamayacak stok var (olası zarar ${zarar} ₺)`, hedef: 'skt' });
  }
  if (olu.adet) mesajlar.push({ tur: 'olu_stok', onem: 'dusuk', metin: `${olu.adet} ürün ${olu.gun} gündür satılmadı (bağlı sermaye ${olu.bagli_sermaye} ₺)`, hedef: 'olu_stok' });
  return {
    tarih: bugun,
    mesajlar,
    bitmek_uzere: bitiyor.slice(0, SIN.bitmek_uzere),
    bitmek_uzere_toplam: bitiyor.length,
    skt_indirim: skt.slice(0, SIN.skt_indirim),
    skt_indirim_toplam: skt.length,
    olu_stok: olu,
    gun_sonu: gs
  };
}

module.exports = { oneriler, bitmekUzere, sktIndirim, oluStok, gunSonu, indirimYuzdesi };
