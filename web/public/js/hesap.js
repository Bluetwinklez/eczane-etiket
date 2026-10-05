// Eczane hesaplayicilari (saf fonksiyonlar). Tarayicida window.Hesap, testlerde require ile kullanilir.
// Sonuclar yardimcidir; doz kararinda ilacin KUB'u ve hekim/eczaci degerlendirmesi esastir.
(function (kok) {
  const y = (n, b = 1) => Math.round(n * 10 ** b) / 10 ** b;
  const yarimMl = (ml) => Math.round(ml * 2) / 2; // olcek/surupta 0,5 ml'ye yuvarlanir

  // Ornek on ayarlar (masaustu programdaki kurallarla ayni). Alanlar ekranda degistirilebilir.
  const ON_AYARLAR = {
    parasetamol: { ad: 'Parasetamol şurup 120 mg/5 ml', minMgKg: 10, maxMgKg: 15, gunlukMaxMgKg: 75, mg: 120, ml: 5, aralik: '4-6 saatte bir, günde en fazla 4 kez', tekDozUst: 1000 },
    ibuprofen: { ad: 'İbuprofen şurup 100 mg/5 ml', minMgKg: 5, maxMgKg: 10, gunlukMaxMgKg: 30, mg: 100, ml: 5, aralik: '6-8 saatte bir, tok karnına', tekDozUst: 400 },
    amoksisilin: { ad: 'Amoksisilin/klavulanat 400 mg/5 ml', minMgKg: 25, maxMgKg: 25, gunlukMaxMgKg: 50, mg: 400, ml: 5, aralik: '12 saat arayla, günde 2 kez', tekDozUst: null }
  };

  function kiloDozu({ kilo, minMgKg, maxMgKg, gunlukMaxMgKg, mg, ml, tekDozUst }) {
    if (!(kilo > 0 && kilo <= 150)) return { hata: 'Kilo 0-150 kg arasında olmalı' };
    if (!(minMgKg > 0) || !(maxMgKg >= minMgKg)) return { hata: 'Doz aralığı (mg/kg) geçersiz' };
    let tekMin = kilo * minMgKg;
    let tekMax = kilo * maxMgKg;
    const uyarilar = [];
    if (tekDozUst && tekMax > tekDozUst) {
      tekMax = tekDozUst;
      tekMin = Math.min(tekMin, tekDozUst);
      uyarilar.push(`Tek doz yetişkin üst sınırı olan ${tekDozUst} mg ile sınırlandı.`);
    }
    const konsantrasyon = mg > 0 && ml > 0 ? mg / ml : null; // mg/ml
    return {
      tek_doz_mg: [y(tekMin), y(tekMax)],
      tek_doz_ml: konsantrasyon ? [yarimMl(tekMin / konsantrasyon), yarimMl(tekMax / konsantrasyon)] : null,
      gunluk_max_mg: gunlukMaxMgKg > 0 ? y(kilo * gunlukMaxMgKg) : null,
      uyarilar
    };
  }

  // "2x1", "3 x 5 ml", "günde 2 kez 1", "1x1/2" -> gunluk birim
  function kullanimCoz(metin) {
    const s = String(metin || '').toLocaleLowerCase('tr-TR').replace(',', '.');
    const kesir = (v) => (v.includes('/') ? Number(v.split('/')[0]) / Number(v.split('/')[1]) : Number(v));
    let m = s.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?(?:\/\d+)?)/);
    if (m) return { kez: Number(m[1]), miktar: kesir(m[2]), gunluk: Number(m[1]) * kesir(m[2]) };
    m = s.match(/günde\s*(\d+)\s*(?:kez|defa)?\s*(\d+(?:\.\d+)?(?:\/\d+)?)?/);
    if (m) {
      const miktar = m[2] ? kesir(m[2]) : 1;
      return { kez: Number(m[1]), miktar, gunluk: Number(m[1]) * miktar };
    }
    return null;
  }

  function kutuBitis({ kutuIcerik, kutuAdedi = 1, kullanim, baslangic }) {
    const k = kullanimCoz(kullanim);
    if (!k || !(k.gunluk > 0)) return { hata: 'Kullanım şeklini "2x1" veya "günde 3 kez 5" gibi yazın' };
    if (!(kutuIcerik > 0)) return { hata: 'Kutudaki miktarı girin (tablet ya da ml)' };
    const toplam = kutuIcerik * (kutuAdedi || 1);
    const gun = Math.floor(toplam / k.gunluk);
    const bas = baslangic ? new Date(baslangic + 'T00:00:00Z') : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const bitis = new Date(bas.getTime() + gun * 86400000);
    return { gunluk: y(k.gunluk, 2), gun, bitis: bitis.toISOString().slice(0, 10), artan: y(toplam - gun * k.gunluk, 2) };
  }

  function siseYeter({ siseMl, tekDozMl, gundeKez, tedaviGun }) {
    if (!(siseMl > 0 && tekDozMl > 0 && gundeKez > 0)) return { hata: 'Şişe hacmi, tek doz ve günlük kullanım sayısını girin' };
    const gunluk = tekDozMl * gundeKez;
    const gun = siseMl / gunluk;
    return { gunluk_ml: y(gunluk), yeter_gun: y(gun), gereken_sise: tedaviGun > 0 ? Math.ceil((gunluk * tedaviGun) / siseMl) : null };
  }

  function vki({ kilo, boyCm }) {
    if (!(kilo > 0 && boyCm > 0)) return { hata: 'Kilo ve boy girin' };
    const deger = kilo / (boyCm / 100) ** 2;
    const sinif = deger < 18.5 ? 'Zayıf' : deger < 25 ? 'Normal' : deger < 30 ? 'Fazla kilolu' : 'Obez';
    return { vki: y(deger), sinif, vya_m2: y(Math.sqrt((boyCm * kilo) / 3600), 2) }; // VYA: Mosteller
  }

  // Cockcroft-Gault kreatinin klirensi (ml/dk); kadinda x0,85
  function kreatininKlirensi({ yas, kilo, kreatinin, kadin }) {
    if (!(yas > 0 && kilo > 0 && kreatinin > 0)) return { hata: 'Yaş, kilo ve serum kreatinin (mg/dl) girin' };
    const deger = ((140 - yas) * kilo) / (72 * kreatinin) * (kadin ? 0.85 : 1);
    const evre = deger >= 90 ? 'Normal' : deger >= 60 ? 'Hafif azalmış' : deger >= 30 ? 'Orta derecede azalmış' : deger >= 15 ? 'Ağır azalmış' : 'Böbrek yetmezliği';
    return { klirens: y(deger), evre };
  }

  // Mal fazlasi ile gercek birim maliyet ve kar marji
  function maliyetKar({ alis, adet, mf = 0, satis, kdvOrani = 10, alisKdvDahil = true }) {
    if (!(alis >= 0 && adet > 0)) return { hata: 'Alış fiyatı ve adet girin' };
    const birim = (alis * adet) / (adet + (mf || 0));
    const birimKdvHaric = alisKdvDahil ? birim / (1 + kdvOrani / 100) : birim;
    const sonuc = { birim_maliyet: y(birim, 2), birim_maliyet_kdv_haric: y(birimKdvHaric, 2), mf_kazanci_yuzde: y(((alis - birim) / (alis || 1)) * 100) };
    if (satis > 0) {
      const satisKdvHaric = satis / (1 + kdvOrani / 100);
      sonuc.kar = y(satisKdvHaric - birimKdvHaric, 2);
      sonuc.kar_marji_yuzde = y(((satisKdvHaric - birimKdvHaric) / satisKdvHaric) * 100);
    }
    return sonuc;
  }

  const Hesap = { ON_AYARLAR, kiloDozu, kullanimCoz, kutuBitis, siseYeter, vki, kreatininKlirensi, maliyetKar };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hesap;
  else kok.Hesap = Hesap;
})(typeof window !== 'undefined' ? window : globalThis);
