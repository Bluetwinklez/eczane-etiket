const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let kasiyer;
let m;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  m = (await kasiyer.post('/api/musteriler', { ad_soyad: 'Puan Musterisi' })).data.id;
});
after(() => sunucu.kapat());

async function bakiye() {
  return (await kasiyer.get(`/api/musteriler/${m}`)).data.puan;
}

test('recetesiz alisveris puan kazandirir; receteli ve SGK kazandirmaz', async () => {
  // Talcid (recetesiz) 31 TL + Augmentin (receteli) 98.75 TL
  const s = (await kasiyer.post('/api/satislar', { musteri_id: m, kalemler: [{ ilac_id: 9, adet: 2 }, { ilac_id: 3, adet: 1 }] })).data;
  assert.equal(s.kazanilan_puan, 62, 'yalnizca 62 TL recetesiz tutar');
  assert.equal(await bakiye(), 62);

  const sgk = (await kasiyer.post('/api/satislar', { musteri_id: m, odeme_tipi: 'sgk', kalemler: [{ ilac_id: 9, adet: 1 }] })).data;
  assert.equal(sgk.kazanilan_puan, 0);
});

test('puan kullanimi: toplamdan duser, recetesiz tutari asamaz, bakiye kontrolu', async () => {
  await kasiyer.post('/api/satislar', { musteri_id: m, kalemler: [{ ilac_id: 9, adet: 30 }] }); // +930 puan
  const once = await bakiye();
  assert.equal(once, 992);

  const fazla = await kasiyer.post('/api/satislar', { musteri_id: m, puan_kullan: 5000, kalemler: [{ ilac_id: 9, adet: 1 }] });
  assert.equal(fazla.status, 400);

  // 31 TL recetesiz + 98.75 receteli; 900 puan istenir ama yalnizca 31 TL'lik (3100 puan) kullanilabilir -> 900 kullanilir = 9 TL
  const onizleme = (await kasiyer.post('/api/satislar/onizleme', { musteri_id: m, puan_kullan: 900, kalemler: [{ ilac_id: 9, adet: 1 }, { ilac_id: 3, adet: 1 }] })).data;
  assert.equal(onizleme.puan_indirimi, 9);
  assert.equal(onizleme.toplam_tutar, 120.75);

  const s = (await kasiyer.post('/api/satislar', { musteri_id: m, puan_kullan: 900, kalemler: [{ ilac_id: 9, adet: 1 }, { ilac_id: 3, adet: 1 }] })).data;
  assert.equal(s.toplam_tutar, 120.75);
  assert.equal(s.kullanilan_puan, 900);
  assert.equal(s.kazanilan_puan, 22, '(31 - 9) TL uzerinden');
  assert.equal(await bakiye(), once - 900 + 22);

  // Recetesiz tutardan fazlasi istenirse kirpilir
  const kirp = (await kasiyer.post('/api/satislar/onizleme', { musteri_id: m, puan_kullan: 50, kalemler: [{ ilac_id: 9, adet: 1 }] })).data;
  assert.equal(kirp.kullanilan_puan, 50);
  const tavan = (await kasiyer.post('/api/satislar/onizleme', { musteri_id: m, puan_kullan: 114, kalemler: [{ ilac_id: 3, adet: 1 }] })).data;
  assert.equal(tavan.kullanilan_puan, 0, 'yalnizca receteli urun: puan kullanilamaz');
});

test('iade: kazanilan puan geri alinir, kullanilan puan geri yuklenir, para puan kismi dusulerek iade edilir', async () => {
  const once = await bakiye();
  assert.ok(once >= 100);
  const s = (await kasiyer.post('/api/satislar', { musteri_id: m, puan_kullan: 100, kalemler: [{ ilac_id: 9, adet: 2 }] })).data;
  // 62 TL - 1 TL puan = 61 TL, kazanim 61
  assert.equal(s.toplam_tutar, 61);
  assert.equal(await bakiye(), once - 100 + 61);

  const iade = (await admin.post('/api/iadeler', { satis_id: s.id, kalemler: [{ satis_kalem_id: s.kalemler[0].id, adet: 2 }] })).data;
  assert.equal(iade.toplam_tutar, 61, 'puanla odenen 1 TL nakit iade edilmez');
  assert.equal(await bakiye(), once, 'tam iadede puan bakiyesi eski haline doner');
});

test('sadakat ayarlarini yalnizca admin degistirir', async () => {
  assert.equal((await kasiyer.put('/api/musteriler/sadakat/ayarlar', { kazanim_orani: 2, puan_degeri: 0.01 })).status, 403);
  const r = await admin.put('/api/musteriler/sadakat/ayarlar', { kazanim_orani: 2, puan_degeri: 0.02 });
  assert.equal(r.data.kazanim_orani, 2);
  const s = (await kasiyer.post('/api/satislar/onizleme', { musteri_id: m, kalemler: [{ ilac_id: 9, adet: 1 }] })).data;
  assert.equal(s.kazanilacak_puan, 62);
  assert.equal((await admin.put('/api/musteriler/sadakat/ayarlar', { kazanim_orani: -1, puan_degeri: 0.01 })).status, 400);
});
