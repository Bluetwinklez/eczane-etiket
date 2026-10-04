const express = require('express');
const { db } = require('../db');
const { bitisTahminleri } = require('./hatirlatmalar');

const router = express.Router();

// Kullanicinin rolune ve subesine gore dikkat gerektiren isleri tek listede toplar.
// Her oge: kod, baslik, aciklama, sayi, seviye (danger/warn/info/ok), link (hash)
router.get('/', (req, res) => {
  const sube = req.user.sube_id;
  const yonetici = req.user.rol === 'admin' || req.user.rol === 'eczaci';
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
  res.json({ toplam: ogeler.reduce((t, o) => t + o.sayi, 0), ogeler });
});

module.exports = router;
