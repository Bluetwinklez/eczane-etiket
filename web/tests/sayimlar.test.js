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

async function partiToplami(id) {
  return (await admin.get(`/api/ilaclar/${id}/partiler`)).data.reduce((t, p) => t + p.miktar, 0);
}

test('kasiyer sayim yapamaz', async () => {
  assert.equal((await kasiyer.get('/api/sayimlar')).status, 403);
});

test('sayim: fazla ve eksik farklari stoga ve partilere islenir, sayilmayanlara dokunulmaz', async () => {
  const s = (await admin.post('/api/sayimlar', { urun_tipi: 'ilac' })).data;
  assert.equal((await admin.post('/api/sayimlar', {})).status, 409, 'ikinci acik sayim olmamali');

  const detay = (await admin.get(`/api/sayimlar/${s.id}`)).data;
  assert.ok(detay.urunler.every((u) => u.urun_tipi === 'ilac'), 'kapsam ilac tipi');
  const [a, b, c] = detay.urunler;

  await admin.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: a.id, sayilan: a.sistem_stok + 5 });
  await admin.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: b.id, sayilan: b.sistem_stok - 3 });
  // Barkod okutma: arti ile ustune ekler
  await admin.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: c.id, sayilan: 1, arti: true });
  const r = await admin.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: c.id, sayilan: 1, arti: true });
  assert.equal(r.data.sayilan, 2);

  const dermo = (await admin.get('/api/ilaclar?urun_tipi=dermokozmetik')).data[0];
  assert.equal((await admin.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: dermo.id, sayilan: 1 })).status, 400, 'kapsam disi');

  const d = detay.urunler[3];
  const dOnce = (await admin.get(`/api/ilaclar/${d.id}`)).data.stok;

  const tamam = await admin.post(`/api/sayimlar/${s.id}/tamamla`, {});
  assert.equal(tamam.status, 200);
  assert.equal(tamam.data.durum, 'tamamlandi');

  assert.equal((await admin.get(`/api/ilaclar/${a.id}`)).data.stok, a.sistem_stok + 5);
  assert.equal((await admin.get(`/api/ilaclar/${b.id}`)).data.stok, b.sistem_stok - 3);
  assert.equal((await admin.get(`/api/ilaclar/${c.id}`)).data.stok, 2);
  assert.equal((await admin.get(`/api/ilaclar/${d.id}`)).data.stok, dOnce, 'sayilmayan degismemeli');
  for (const u of [a, b, c]) {
    assert.equal(await partiToplami(u.id), (await admin.get(`/api/ilaclar/${u.id}`)).data.stok, 'partiler stokla esit');
  }

  const sonuc = (await admin.get(`/api/sayimlar/${s.id}`)).data;
  assert.equal(sonuc.urunler.length, 3, 'tamamlanmis sayim yalnizca sayilanlari gosterir');
  assert.equal(sonuc.ozet.fazla, 1);
  assert.ok(sonuc.ozet.eksik >= 1);

  assert.equal((await admin.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: a.id, sayilan: 1 })).status, 400, 'kapali sayim');
});

test('fark tamamlama anindaki stoga gore hesaplanir (arada satis olursa)', async () => {
  const s = (await admin.post('/api/sayimlar', {})).data;
  const urun = (await admin.get('/api/ilaclar/1')).data;
  await admin.put(`/api/sayimlar/${s.id}/kalemler`, { ilac_id: 1, sayilan: urun.stok - 2 });
  await admin.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 2 }] });
  await admin.post(`/api/sayimlar/${s.id}/tamamla`, {});
  const sonuc = (await admin.get(`/api/sayimlar/${s.id}`)).data;
  assert.equal(sonuc.urunler.find((u) => u.id === 1).fark, 0, 'satis sonrasi stok sayilanla esit');
});

test('bos sayim tamamlanamaz, iptal edilebilir', async () => {
  const s = (await admin.post('/api/sayimlar', {})).data;
  assert.equal((await admin.post(`/api/sayimlar/${s.id}/tamamla`, {})).status, 400);
  assert.equal((await admin.post(`/api/sayimlar/${s.id}/iptal`, {})).data.durum, 'iptal');
});
