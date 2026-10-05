const express = require('express');
const { fiyatFarklari } = require('./fiyatListesi');
const { db } = require('../db');
const { bitisTahminleri } = require('./hatirlatmalar');
const { acikFaturalar } = require('./tedarikciler');
const { yaklasanDogumGunleri } = require('./musteriler');
const { raporBitisSayisi } = require('./takip');

const router = express.Router();

// Kullanicinin rolune ve subesine gore dikkat gerektiren isleri tek listede toplar.
// Her oge: kod, baslik, aciklama, sayi, seviye (danger/warn/info/ok), link (hash)
function bildirimOgeleri(user) {
  const sube = user.sube_id;
  const yonetici = user.rol === 'admin' || user.rol === 'eczaci';
  const ogeler = [];
  const ekle = (oge) => {
    if (oge.sayi > 0) ogeler.push(oge);
  };
  const sayi = (sql, ...p) => db.prepare(sql).get(...p).c;

  ekle({
    kod: 'skt_gecmis',
    baslik: "SKT'si geçmiş parti",
    aciklama: 'Elde stoğu olan, son kullanma tarihi geçmiş partiler; imha veya iade edin',
    sayi: sayi("SELECT COUNT(*) AS c FROM ilac_partileri WHERE sube_id = ? AND miktar > 0 AND skt < date('now')", sube),
    seviye: 'danger',
    link: yonetici ? '#kalite' : '#stok'
  });
  ekle({
    kod: 'kritik_stok',
    baslik: 'Kritik stok',
    aciklama: 'Stoğu kritik sınırın altına düşen ürünler',
    sayi: sayi(
      `SELECT COUNT(*) AS c FROM ilaclar i LEFT JOIN ilac_stok s ON s.ilac_id = i.id AND s.sube_id = ?
       WHERE COALESCE(s.stok, 0) <= i.kritik_stok`,
      sube
    ),
    seviye: 'warn',
    link: yonetici ? '#siparisler' : '#stok'
  });
  ekle({
    kod: 'skt_yakin',
    baslik: '30 gün içinde SKT',
    aciklama: 'Son kullanma tarihi yaklaşan partiler; önce bunları satın (FEFO)',
    sayi: sayi(
      "SELECT COUNT(*) AS c FROM ilac_partileri WHERE sube_id = ? AND miktar > 0 AND skt >= date('now') AND skt <= date('now', '+30 days')",
      sube
    ),
    seviye: 'warn',
    link: '#stok'
  });

  ekle({
    kod: 'sicaklik_aralik_disi',
    baslik: 'Soğuk zincir aralık dışı',
    aciklama: 'Son 24 saatte 2-8 °C dışında ölçülen dolap sıcaklığı',
    sayi: sayi("SELECT COUNT(*) AS c FROM sicaklik_kayitlari WHERE sube_id = ? AND aralik_disi = 1 AND tarih >= datetime('now', '-1 day')", sube),
    seviye: 'danger',
    link: '#kalite'
  });
  ekle({
    kod: 'sicaklik_olcum_yok',
    baslik: 'Bugün sıcaklık ölçülmedi',
    aciklama: 'Soğuk zincir dolabı için bugün kayıt girilmedi',
    sayi:
      db.prepare('SELECT 1 FROM sicaklik_kayitlari WHERE sube_id = ? LIMIT 1').get(sube) &&
      !db.prepare("SELECT 1 FROM sicaklik_kayitlari WHERE sube_id = ? AND date(tarih) = date('now')").get(sube)
        ? 1
        : 0,
    seviye: 'info',
    link: '#kalite'
  });

  ekle({
    kod: 'dogum_gunu',
    baslik: 'Bugün doğum günü olan müşteri',
    aciklama: 'Kutlama mesajı gönderebilirsiniz (ileti izni olanlara)',
    sayi: yaklasanDogumGunleri(0).length,
    seviye: 'ok',
    link: '#musteriler'
  });

  // Son 30 gunde yuklenen fiyat listesinde PSF'si satis fiyatindan farkli urunler
  const otuzGunOnce = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  ekle({
    kod: 'fiyat_farki',
    baslik: 'Fiyat listesiyle uyuşmayan ürün',
    aciklama: 'Yüklenen fiyat listesindeki PSF satış fiyatından farklı; uygulayıp etiketleri yeniden basın',
    sayi: fiyatFarklari().filter((f) => f.tarih >= otuzGunOnce).length,
    seviye: 'warn',
    link: '#etiketler'
  });

  ekle({
    kod: 'rapor_bitiyor',
    baslik: 'Raporu bitmek üzere olan hasta',
    aciklama: '15 gün içinde biten ilaç raporları; hastaya yenileme için haber verin',
    sayi: raporBitisSayisi(sube),
    seviye: 'warn',
    link: '#hasta-takip'
  });

  const bitenler = bitisTahminleri(sube).filter((r) => r.kalan_gun <= 3 && r.kalan_gun >= -30 && !r.hatirlatildi);
  ekle({
    kod: 'ilac_bitis',
    baslik: 'İlacı biten müşteri',
    aciklama: '3 gün içinde bitecek/bitmiş kronik ilaçlar, henüz hatırlatılmadı',
    sayi: bitenler.length,
    seviye: 'info',
    link: '#hatirlatmalar'
  });
  ekle({
    kod: 'istek_geldi',
    baslik: 'İstenen ürün geldi',
    aciklama: 'İstek defterindeki ürün stokta; müşteriye haber verin',
    sayi: sayi(
      `SELECT COUNT(*) AS c FROM istekler ist JOIN ilac_stok s ON s.ilac_id = ist.ilac_id AND s.sube_id = ist.sube_id
       WHERE ist.sube_id = ? AND ist.durum = 'bekliyor' AND s.stok >= ist.adet`,
      sube
    ),
    seviye: 'ok',
    link: '#istekler'
  });
  ekle({
    kod: 'veresiye_gecikmis',
    baslik: '30 günü geçen veresiye',
    aciklama: 'Son tahsilattan (yoksa ilk borçtan) bu yana 30 günü geçen açık hesaplar',
    sayi: sayi(
      `SELECT COUNT(*) AS c FROM (
         SELECT musteri_id, SUM(CASE WHEN tip = 'borc' THEN tutar ELSE -tutar END) AS bakiye,
                COALESCE(MAX(CASE WHEN tip = 'tahsilat' THEN tarih END), MIN(CASE WHEN tip = 'borc' THEN tarih END)) AS referans
         FROM cari_hareketler GROUP BY musteri_id)
       WHERE bakiye > 0.001 AND referans < datetime('now', '-30 days')`
    ),
    seviye: 'warn',
    link: '#veresiye'
  });
  ekle({
    kod: 'kasa_acik',
    baslik: 'Dünün kasası kapatılmadı',
    aciklama: 'Dün satış yapıldı ama gün sonu kasa kapanışı yapılmadı',
    sayi:
      sayi("SELECT COUNT(*) AS c FROM satislar WHERE sube_id = ? AND date(tarih) = date('now', '-1 day')", sube) > 0 &&
      !db.prepare("SELECT id FROM kasa_kapanislari WHERE sube_id = ? AND tarih = date('now', '-1 day')").get(sube)
        ? 1
        : 0,
    seviye: 'warn',
    link: '#kasa-kapanisi'
  });
  ekle({
    kod: 'devir_notu',
    baslik: 'Açık devir notu',
    aciklama: 'Vardiya devir notlarında tamamlanmamış işler',
    sayi: sayi('SELECT COUNT(*) AS c FROM vardiya_notlari WHERE sube_id = ? AND tamamlandi = 0', sube),
    seviye: 'info',
    link: '#vardiya'
  });
  ekle({
    kod: 'nobet_bugun',
    baslik: 'Bugün nöbetçisiniz',
    aciklama: 'Nöbet takviminde bugün işaretli',
    sayi: sayi("SELECT COUNT(*) AS c FROM nobetler WHERE sube_id = ? AND tarih = date('now', '+3 hours')", sube),
    seviye: 'info',
    link: '#nobetler'
  });

  if (yonetici) {
    // Vadesi gecmis veya 7 gun icinde dolacak tedarikci faturalari
    const bugun = new Date().toISOString().slice(0, 10);
    const sinir = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let gecikmis = 0;
    let yaklasan = 0;
    for (const t of db.prepare('SELECT DISTINCT tedarikci_id AS id FROM tedarikci_hareketleri WHERE sube_id = ?').all(sube)) {
      for (const f of acikFaturalar(t.id, sube)) {
        const vade = f.vade_tarihi || f.belge_tarihi;
        if (vade < bugun) gecikmis += 1;
        else if (vade <= sinir) yaklasan += 1;
      }
    }
    ekle({ kod: 'vade_gecmis', baslik: 'Vadesi geçmiş fatura', aciklama: 'Tedarikçi faturası ödeme günü geçti', sayi: gecikmis, seviye: 'danger', link: '#tedarikciler' });
    ekle({ kod: 'vade_yakin', baslik: '7 gün içinde vadesi dolan fatura', aciklama: 'Yaklaşan tedarikçi ödemeleri', sayi: yaklasan, seviye: 'warn', link: '#tedarikciler' });
    ekle({
      kod: 'transfer_gelen',
      baslik: 'Teslim bekleyen transfer',
      aciklama: 'Başka şubeden gönderilen, teslim alınmamış transferler',
      sayi: sayi("SELECT COUNT(*) AS c FROM transferler WHERE hedef_sube_id = ? AND durum = 'yolda'", sube),
      seviye: 'warn',
      link: '#transferler'
    });
    ekle({
      kod: 'siparis_gecikmis',
      baslik: 'Geciken sipariş',
      aciklama: '3 gündür teslim alınmamış bekleyen/gönderilmiş siparişler',
      sayi: sayi(
        "SELECT COUNT(*) AS c FROM siparisler WHERE sube_id = ? AND durum IN ('beklemede', 'gonderildi') AND olusturma_tarihi < datetime('now', '-3 days')",
        sube
      ),
      seviye: 'warn',
      link: '#siparisler'
    });
    ekle({
      kod: 'emanet_acik',
      baslik: 'Açık emanet',
      aciklama: 'Kapanmamış emanet ilaç kayıtları',
      sayi: sayi("SELECT COUNT(*) AS c FROM emanetler WHERE sube_id = ? AND durum = 'acik'", sube),
      seviye: 'info',
      link: '#emanetler'
    });
    ekle({
      kod: 'sayim_acik',
      baslik: 'Açık stok sayımı',
      aciklama: 'Başlatılmış ama tamamlanmamış sayım',
      sayi: sayi("SELECT COUNT(*) AS c FROM sayimlar WHERE sube_id = ? AND durum = 'acik'", sube),
      seviye: 'info',
      link: '#sayim'
    });
  }

  const SIRA = { danger: 0, warn: 1, ok: 2, info: 3 };
  ogeler.sort((a, b) => SIRA[a.seviye] - SIRA[b.seviye]);
  return { toplam: ogeler.reduce((t, o) => t + o.sayi, 0), ogeler };
}

router.get('/', (req, res) => res.json(bildirimOgeleri(req.user)));

module.exports = router;
module.exports.bildirimOgeleri = bildirimOgeleri;
