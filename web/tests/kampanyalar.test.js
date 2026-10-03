const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let kasiyer;
let derm;
let takviye;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  derm = (await admin.get('/api/ilaclar?urun_tipi=dermokozmetik')).data[0];
  takviye = (await admin.get('/api/ilaclar?urun_tipi=takviye')).data[0];
});
after(() => sunucu.kapat());

test('kampanya dogrulamasi: receteli urun ve gecersiz X al Y ode reddedilir', async () => {
  const receteli = (await admin.get('/api/ilaclar')).data.find((i) => i.receteli);
  const r1 = await admin.post('/api/kampanyalar', { ad: 'X', tip: 'yuzde', indirim_yuzdesi: 10, hedef_tip: 'urun', hedef_deger: receteli.id });
  assert.equal(r1.status, 400);
  const r2 = await admin.post('/api/kampanyalar', { ad: 'X', tip: 'x_al_y_ode', al_adet: 2, ode_adet: 2, hedef_tip: 'tumu' });
  assert.equal(r2.status, 400);
  const r3 = await kasiyer.post('/api/kampanyalar', { ad: 'X', tip: 'yuzde', indirim_yuzdesi: 10, hedef_tip: 'tumu' });
  assert.equal(r3.status, 403);
});

test('yuzde kampanyasi satista kalem bazinda uygulanir ve satis toplamina yansir', async () => {
  const k = await admin.post('/api/kampanyalar', {
    ad: 'Dermo %20', tip: 'yuzde', indirim_yuzdesi: 20, hedef_tip: 'urun_tipi', hedef_deger: 'dermokozmetik'
  });
  assert.equal(k.status, 201);
  assert.equal(k.data.durum, 'aktif');

  const satis = await admin.post('/api/satislar', {
    kalemler: [{ ilac_id: derm.id, adet: 1 }, { ilac_id: 1, adet: 1 }],
    indirim_yuzdesi: 10
  });
  assert.equal(satis.status, 201);
  const dermKalem = satis.data.kalemler.find((x) => x.ilac_id === derm.id);
  const parolKalem = satis.data.kalemler.find((x) => x.ilac_id === 1);
  const beklenenIndirim = Math.round(derm.satis_fiyati * 0.2 * 100) / 100;
  assert.equal(dermKalem.kalem_indirimi, beklenenIndirim);
  assert.equal(dermKalem.kampanya_adi, 'Dermo %20');
  assert.equal(dermKalem.ara_toplam, Math.round((derm.satis_fiyati - beklenenIndirim) * 100) / 100);
  assert.equal(parolKalem.kalem_indirimi, 0);

  const brut = derm.satis_fiyati + parolKalem.birim_fiyat;
  assert.equal(satis.data.ara_toplam, Math.round(brut * 100) / 100);
  assert.equal(satis.data.kampanya_indirimi, beklenenIndirim);
  const beklenenGenel = Math.round((brut - beklenenIndirim) * 0.1 * 100) / 100;
  assert.equal(satis.data.indirim_tutari, beklenenGenel);
  assert.ok(Math.abs(satis.data.toplam_tutar - (brut - beklenenIndirim - beklenenGenel)) < 0.011);
});

test('X al Y ode kampanyasi ve en iyi kampanyanin secilmesi', async () => {
  await admin.post('/api/kampanyalar', {
    ad: 'Takviye 3 al 2 ode', tip: 'x_al_y_ode', al_adet: 3, ode_adet: 2, hedef_tip: 'urun', hedef_deger: takviye.id
  });
  await admin.post('/api/kampanyalar', {
    ad: 'Vitamin %5', tip: 'yuzde', indirim_yuzdesi: 5, hedef_tip: 'kategori', hedef_deger: takviye.kategori
  });

  const iki = (await kasiyer.post('/api/satislar/onizleme', { kalemler: [{ ilac_id: takviye.id, adet: 2 }] })).data;
  assert.equal(iki.kalemler[0].kampanya_adi, 'Vitamin %5', '2 adette 3 al 2 ode islemez, %5 secilmeli');

  const yedi = (await kasiyer.post('/api/satislar/onizleme', { kalemler: [{ ilac_id: takviye.id, adet: 7 }] })).data;
  assert.equal(yedi.kalemler[0].kampanya_adi, 'Takviye 3 al 2 ode');
  assert.equal(yedi.kalemler[0].kalem_indirimi, Math.round(takviye.satis_fiyati * 2 * 100) / 100, '7 adette 2 bedava');
});

test('ayni urun iki satirda gelirse birlestirilir', async () => {
  const h = (await kasiyer.post('/api/satislar/onizleme', {
    kalemler: [{ ilac_id: takviye.id, adet: 2 }, { ilac_id: takviye.id, adet: 1 }]
  })).data;
  assert.equal(h.kalemler.length, 1);
  assert.equal(h.kalemler[0].adet, 3);
  assert.equal(h.kalemler[0].kampanya_adi, 'Takviye 3 al 2 ode');
});

test('pasif veya suresi dolmus kampanya uygulanmaz', async () => {
  const urun = (await admin.get('/api/ilaclar?urun_tipi=medikal')).data[0];
  await admin.post('/api/kampanyalar', {
    ad: 'Gecmis', tip: 'yuzde', indirim_yuzdesi: 50, hedef_tip: 'urun', hedef_deger: urun.id, baslangic: '2020-01-01', bitis: '2020-12-31'
  });
  await admin.post('/api/kampanyalar', {
    ad: 'Pasif', tip: 'yuzde', indirim_yuzdesi: 50, hedef_tip: 'urun', hedef_deger: urun.id, aktif: false
  });
  const h = (await kasiyer.post('/api/satislar/onizleme', { kalemler: [{ ilac_id: urun.id, adet: 1 }] })).data;
  assert.equal(h.kalemler[0].kalem_indirimi, 0);

  const liste = (await admin.get('/api/kampanyalar')).data;
  assert.equal(liste.find((k) => k.ad === 'Gecmis').durum, 'sona_erdi');
  assert.equal(liste.find((k) => k.ad === 'Pasif').durum, 'pasif');
  const aktif = (await kasiyer.get('/api/kampanyalar/aktif')).data.map((k) => k.ad);
  assert.ok(!aktif.includes('Gecmis') && !aktif.includes('Pasif'));
});

test('kampanya performans raporu verilen indirimi toplar', async () => {
  const rapor = (await admin.get('/api/raporlar/kampanya-performansi')).data;
  const dermo = rapor.find((r) => r.kampanya_adi === 'Dermo %20');
  assert.ok(dermo);
  assert.equal(dermo.satis_adedi, 1);
  assert.ok(dermo.toplam_indirim > 0);
});
