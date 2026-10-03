const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

async function partiler(ilacId) {
  return (await admin.get(`/api/ilaclar/${ilacId}/partiler?tumu=1`)).data;
}

test('kasiyer iade yapamaz', async () => {
  const r = await kasiyer.post('/api/iadeler', { satis_id: 1, kalemler: [] });
  assert.equal(r.status, 403);
});

test('kismi iade: stok satildigi partiye doner, tutar indirim oraninda, fazlasi reddedilir', async () => {
  const yeni = await admin.post('/api/ilaclar', { ad: 'Iade Test', satis_fiyati: 100 });
  const id = yeni.data.id;
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 5, parti_no: 'A', skt: '2029-01-01' });
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 5, parti_no: 'B', skt: '2030-01-01' });

  // 7 adet: A'dan 5, B'den 2 duser. %10 genel indirim.
  const satis = await admin.post('/api/satislar', { kalemler: [{ ilac_id: id, adet: 7 }], indirim_yuzdesi: 10 });
  assert.equal(satis.status, 201);
  const kalemId = satis.data.kalemler[0].id;

  const fazla = await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: kalemId, adet: 8 }] });
  assert.equal(fazla.status, 400);

  const iade = await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: kalemId, adet: 3 }], neden: 'test' });
  assert.equal(iade.status, 201);
  assert.equal(iade.data.toplam_tutar, 270, '3 x 100 x 0.9');

  assert.equal((await admin.get(`/api/ilaclar/${id}`)).data.stok, 6);
  const p = await partiler(id);
  // Son dusulen parti (B) once geri doner: B'ye 2, A'ya 1
  assert.equal(p.find((x) => x.parti_no === 'B').miktar, 5);
  assert.equal(p.find((x) => x.parti_no === 'A').miktar, 1);

  // Kalan 4 adet iade edilince toplam iade satis tutarina esit olur
  const kalan = await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: kalemId, adet: 4 }] });
  assert.equal(kalan.status, 201);
  assert.ok(Math.abs(iade.data.toplam_tutar + kalan.data.toplam_tutar - satis.data.toplam_tutar) < 0.001);

  const tekrar = await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: kalemId, adet: 1 }] });
  assert.equal(tekrar.status, 400);
});

test('stoga alinmayan iade stogu degistirmez', async () => {
  const stokOnce = (await admin.get('/api/ilaclar/4')).data.stok;
  const satis = await admin.post('/api/satislar', { kalemler: [{ ilac_id: 4, adet: 1 }] });
  const r = await admin.post('/api/iadeler', {
    satis_id: satis.data.id,
    kalemler: [{ satis_kalem_id: satis.data.kalemler[0].id, adet: 1 }],
    stoga_geri_al: false
  });
  assert.equal(r.status, 201);
  assert.equal((await admin.get('/api/ilaclar/4')).data.stok, stokOnce - 1);
});

test('nakit iade kasa ozetinden duser, veresiye iade borcu azaltir', async () => {
  const once = (await admin.get('/api/kasa-kapanislari/ozet')).data;
  const satis = await admin.post('/api/satislar', { kalemler: [{ ilac_id: 2, adet: 2 }], odeme_tipi: 'nakit' });
  await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: satis.data.kalemler[0].id, adet: 2 }] });
  const sonra = (await admin.get('/api/kasa-kapanislari/ozet')).data;
  assert.ok(Math.abs(sonra.nakit - once.nakit) < 0.001, 'satis + tam iade nakdi degistirmemeli');
  assert.ok(sonra.iade > once.iade);

  const vSatis = await admin.post('/api/satislar', { musteri_id: 1, odeme_tipi: 'veresiye', kalemler: [{ ilac_id: 2, adet: 1 }] });
  const borc = (await admin.get('/api/musteriler/1')).data.veresiye_bakiyesi;
  await admin.post('/api/iadeler', { satis_id: vSatis.data.id, kalemler: [{ satis_kalem_id: vSatis.data.kalemler[0].id, adet: 1 }] });
  const yeniBorc = (await admin.get('/api/musteriler/1')).data.veresiye_bakiyesi;
  assert.ok(Math.abs(borc - yeniBorc - vSatis.data.toplam_tutar) < 0.001);
});

test('kar-zarar ve iade raporlari iadeleri gosterir', async () => {
  const kz = (await admin.get('/api/raporlar/kar-zarar')).data;
  const bugun = new Date().toISOString().slice(0, 10);
  assert.ok(kz.find((r) => r.tarih === bugun).toplam_iade > 0);
  const rapor = (await admin.get('/api/raporlar/iadeler')).data;
  assert.ok(rapor.length >= 4);
  assert.ok(rapor.some((r) => r.stoga_alindi === 'Hayir'));
});
