const { db } = require('./db');

function yuvarla(n) {
  return Math.round(n * 100) / 100;
}

function bugunTarihi() {
  return new Date().toISOString().slice(0, 10);
}

function aktifKampanyalar(tarih = bugunTarihi()) {
  return db
    .prepare(
      `SELECT * FROM kampanyalar
       WHERE aktif = 1
         AND (baslangic IS NULL OR baslangic <= ?)
         AND (bitis IS NULL OR bitis >= ?)`
    )
    .all(tarih, tarih);
}

// Receteli ilaclarin fiyati mevzuatla belirlenir; kampanyalar onlara uygulanmaz.
function kampanyaUygunMu(kampanya, ilac) {
  if (ilac.receteli) return false;
  switch (kampanya.hedef_tip) {
    case 'tumu':
      return true;
    case 'urun':
      return Number(kampanya.hedef_deger) === ilac.id;
    case 'kategori':
      return (
        !!ilac.kategori &&
        ilac.kategori.toLocaleLowerCase('tr-TR') === String(kampanya.hedef_deger || '').toLocaleLowerCase('tr-TR')
      );
    case 'urun_tipi':
      return (ilac.urun_tipi || 'ilac') === kampanya.hedef_deger;
    default:
      return false;
  }
}

function kampanyaIndirimi(kampanya, birimFiyat, adet) {
  if (kampanya.tip === 'yuzde') {
    return yuvarla(birimFiyat * adet * (Number(kampanya.indirim_yuzdesi) / 100));
  }
  if (kampanya.tip === 'x_al_y_ode') {
    const al = Number(kampanya.al_adet);
    const ode = Number(kampanya.ode_adet);
    if (!(al > ode && ode >= 1)) return 0;
    const bedava = Math.floor(adet / al) * (al - ode);
    return yuvarla(bedava * birimFiyat);
  }
  return 0;
}

// Her kalem icin en yuksek indirimi saglayan tek kampanya secilir (kampanyalar birlesmez).
function enIyiKampanya(ilac, adet, kampanyalar) {
  let secilen = null;
  let indirim = 0;
  for (const k of kampanyalar) {
    if (!kampanyaUygunMu(k, ilac)) continue;
    const tutar = kampanyaIndirimi(k, ilac.satis_fiyati, adet);
    if (tutar > indirim) {
      indirim = tutar;
      secilen = k;
    }
  }
  return { kampanya: secilen, indirim };
}

// Sepetin tamamini hesaplar: kalem bazli kampanya indirimi, ardindan satis
// geneline uygulanan yuzde indirim.
function sepetHesapla(hazirlanmis, indirimYuzdesi) {
  const kampanyalar = aktifKampanyalar();
  const kalemler = hazirlanmis.map(({ ilac, adet }) => {
    const brut = yuvarla(ilac.satis_fiyati * adet);
    const { kampanya, indirim } = enIyiKampanya(ilac, adet, kampanyalar);
    return {
      ilac,
      adet,
      brut,
      kalem_indirimi: indirim,
      net: yuvarla(brut - indirim),
      kampanya_id: kampanya ? kampanya.id : null,
      kampanya_adi: kampanya ? kampanya.ad : null
    };
  });
  const araToplam = yuvarla(kalemler.reduce((t, k) => t + k.brut, 0));
  const kampanyaIndirimiToplam = yuvarla(kalemler.reduce((t, k) => t + k.kalem_indirimi, 0));
  const indirimTutari = yuvarla((araToplam - kampanyaIndirimiToplam) * (indirimYuzdesi / 100));
  return {
    kalemler,
    ara_toplam: araToplam,
    kampanya_indirimi: kampanyaIndirimiToplam,
    indirim_tutari: indirimTutari,
    toplam_tutar: yuvarla(araToplam - kampanyaIndirimiToplam - indirimTutari)
  };
}

module.exports = { aktifKampanyalar, kampanyaUygunMu, kampanyaIndirimi, sepetHesapla };
