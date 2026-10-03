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

test('istek: urun stoga girince stokta_var olur, kayitli musteriye haber verilir', async () => {
  const ilac = (await admin.post('/api/ilaclar', { ad: 'Istek Urunu', satis_fiyati: 10 })).data;
  const ist = (await kasiyer.post('/api/istekler', { musteri_id: 1, ilac_id: ilac.id, adet: 2 })).data;
  assert.equal(ist.musteri_adi, 'Ahmet Yilmaz');
  assert.equal(ist.telefon, '05551112233');

  let liste = (await kasiyer.get('/api/istekler?durum=acik')).data;
  assert.equal(liste.find((i) => i.id === ist.id).stokta_var, false);

  await admin.post(`/api/ilaclar/${ilac.id}/stok`, { tip: 'giris', adet: 1 });
  liste = (await kasiyer.get('/api/istekler?durum=acik')).data;
  assert.equal(liste.find((i) => i.id === ist.id).stokta_var, false, '2 isteniyor, 1 var');
  await admin.post(`/api/ilaclar/${ilac.id}/stok`, { tip: 'giris', adet: 1 });
  liste = (await kasiyer.get('/api/istekler?durum=acik')).data;
  assert.equal(liste.find((i) => i.id === ist.id).stokta_var, true);

  const haber = (await kasiyer.post(`/api/istekler/${ist.id}/haber-ver`, { kanal: 'sms' })).data;
  assert.match(haber.bildirim.mesaj, /Istek Urunu/);
  assert.equal(haber.istek.durum, 'haber_verildi');

  await kasiyer.put(`/api/istekler/${ist.id}/durum`, { durum: 'teslim_edildi' });
  assert.ok(!(await kasiyer.get('/api/istekler?durum=acik')).data.some((i) => i.id === ist.id));
});

test('istek: katalogda olmayan urun ve kayitsiz musteri; haber-ver kayitli musteri ister', async () => {
  const ist = (await kasiyer.post('/api/istekler', { musteri_adi: 'Mehmet Bey', telefon: '0555', urun_adi: 'Ozel Krem' })).data;
  assert.equal(ist.ilac_id, null);
  assert.equal((await kasiyer.post(`/api/istekler/${ist.id}/haber-ver`, {})).status, 400);
  assert.equal((await kasiyer.post('/api/istekler', { urun_adi: 'X' })).status, 400, 'musteri adi yok');
  assert.equal((await kasiyer.post('/api/istekler', { musteri_adi: 'Y' })).status, 400, 'urun yok');
});

test('emanet: alinan stoga girer, geri verilince duser; verilen stoktan duser, mahsupta stoga dokunulmaz', async () => {
  const once = (await admin.get('/api/ilaclar/2')).data.stok;
  const alinan = (await admin.post('/api/emanetler', { yon: 'alinan', karsi_eczane: 'Sifa Eczanesi', ilac_id: 2, adet: 3 })).data;
  assert.equal((await admin.get('/api/ilaclar/2')).data.stok, once + 3);

  const verilen = (await admin.post('/api/emanetler', { yon: 'verilen', karsi_eczane: 'Deva Eczanesi', ilac_id: 2, adet: 2 })).data;
  assert.equal((await admin.get('/api/ilaclar/2')).data.stok, once + 1);
  assert.equal((await admin.post('/api/emanetler', { yon: 'verilen', karsi_eczane: 'Deva', ilac_id: 2, adet: 99999 })).status, 400);

  const ozet = (await admin.get('/api/emanetler')).data.eczaneler;
  assert.equal(ozet.find((o) => o.karsi_eczane === 'Sifa Eczanesi').alinan_adet, 3);
  assert.equal(ozet.find((o) => o.karsi_eczane === 'Deva Eczanesi').verilen_adet, 2);

  await admin.post(`/api/emanetler/${alinan.id}/kapat`, { sekil: 'urun_iade' });
  assert.equal((await admin.get('/api/ilaclar/2')).data.stok, once - 2, 'geri verdik');
  await admin.post(`/api/emanetler/${verilen.id}/kapat`, { sekil: 'mahsup' });
  assert.equal((await admin.get('/api/ilaclar/2')).data.stok, once - 2, 'mahsup stogu degistirmez');
  assert.equal((await admin.post(`/api/emanetler/${verilen.id}/kapat`, {})).status, 400);
  assert.equal((await admin.get('/api/emanetler')).data.eczaneler.length, 0);
  assert.equal((await kasiyer.get('/api/emanetler')).status, 403);
});
