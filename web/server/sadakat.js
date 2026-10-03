const { db, ayarOku, ayarYaz } = require('./db');

// Varsayilan: 1 TL = 1 puan kazanilir, 100 puan = 1 TL indirim (yaklasik %1 geri donus)
const VARSAYILAN = { kazanim_orani: 1, puan_degeri: 0.01, aktif: true };

function ayarlar() {
  const ham = ayarOku('sadakat_ayarlari');
  return ham ? { ...VARSAYILAN, ...JSON.parse(ham) } : { ...VARSAYILAN };
}

function ayarlariKaydet(yeni) {
  const a = { ...ayarlar(), ...yeni };
  ayarYaz('sadakat_ayarlari', JSON.stringify(a));
  return a;
}

function puanBakiyesi(musteriId) {
  return db.prepare('SELECT COALESCE(SUM(puan), 0) AS p FROM puan_hareketleri WHERE musteri_id = ?').get(musteriId).p;
}

function puanHareketi(musteriId, puan, aciklama, satisId, iadeId) {
  if (!puan) return;
  db.prepare('INSERT INTO puan_hareketleri (musteri_id, satis_id, iade_id, puan, aciklama) VALUES (?, ?, ?, ?, ?)').run(
    musteriId,
    satisId || null,
    iadeId || null,
    puan,
    aciklama
  );
}

// Sepet hesabina puan kullanimini ve kazanilacak puani ekler. Receteli ilaclar
// ve SGK satislari puan kazandirmaz, puanla da odenemez.
function puanUygula(hesap, { musteri, puanKullan, sgk }) {
  const a = ayarlar();
  const sonuc = { kullanilan_puan: 0, puan_indirimi: 0, kazanilacak_puan: 0, puan_bakiyesi: null, puan_hatasi: null };
  if (!a.aktif || !musteri) return sonuc;
  sonuc.puan_bakiyesi = puanBakiyesi(musteri.id);
  if (sgk) return sonuc;

  // Satis geneli yuzde indirim sonrasi recetesiz net tutar
  const kampanyaSonrasi = hesap.ara_toplam - hesap.kampanya_indirimi;
  const carpan = kampanyaSonrasi > 0 ? 1 - hesap.indirim_tutari / kampanyaSonrasi : 1;
  const recetesizNet = hesap.kalemler.filter((k) => !k.ilac.receteli).reduce((t, k) => t + k.net, 0) * carpan;

  const istenen = Math.max(0, Math.floor(Number(puanKullan) || 0));
  if (istenen > 0) {
    if (istenen > sonuc.puan_bakiyesi) {
      sonuc.puan_hatasi = `Yetersiz puan (bakiye: ${sonuc.puan_bakiyesi})`;
      return sonuc;
    }
    // Indirim recetesiz tutari asamaz
    const azamiPuan = Math.floor(recetesizNet / a.puan_degeri);
    sonuc.kullanilan_puan = Math.min(istenen, azamiPuan);
    sonuc.puan_indirimi = Math.round(sonuc.kullanilan_puan * a.puan_degeri * 100) / 100;
  }
  sonuc.kazanilacak_puan = Math.max(0, Math.floor((recetesizNet - sonuc.puan_indirimi) * a.kazanim_orani));
  return sonuc;
}

module.exports = { ayarlar, ayarlariKaydet, puanBakiyesi, puanHareketi, puanUygula };
