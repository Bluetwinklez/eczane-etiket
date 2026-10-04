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

test('kar-zarar raporu giderleri dusup net kari hesaplar', async () => {
  await admin.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 2 }] });
  const bugun = new Date().toISOString().slice(0, 10);
  await admin.post('/api/giderler', { kategori: 'kira', tutar: 100, tarih: bugun });

  const rapor = (await admin.get('/api/raporlar/kar-zarar')).data;
  const gun = rapor.find((r) => r.tarih === bugun);
  assert.ok(gun, 'bugunun satiri olmali');
  assert.equal(gun.toplam_gider, 100);
  assert.ok(Math.abs(gun.net_kar - (gun.kar - 100)) < 0.001);
});

test('raporlar CSV olarak indirilebilir', async () => {
  const res = await admin.get('/api/raporlar/satis?format=csv');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.data, /Dönem;Satış Adedi/);
});

test('ayni gun icin kasa iki kez kapatilamaz', async () => {
  const ilk = await kasiyer.post('/api/kasa-kapanislari', { nakit_sayilan: 0 });
  assert.equal(ilk.status, 201);
  const ikinci = await kasiyer.post('/api/kasa-kapanislari', { nakit_sayilan: 0 });
  assert.equal(ikinci.status, 409);
});

test('siparis teslim alininca stok artar ve durum kilitlenir', async () => {
  const stokOnce = (await admin.get('/api/ilaclar/10')).data.stok;
  const siparis = await admin.post('/api/siparisler', {
    tedarikci_id: 1,
    kalemler: [{ ilac_id: 10, istenen_adet: 25 }]
  });
  assert.equal(siparis.status, 201);

  const teslim = await admin.put(`/api/siparisler/${siparis.data.id}/durum`, { durum: 'teslim_alindi' });
  assert.equal(teslim.status, 200);
  assert.equal((await admin.get('/api/ilaclar/10')).data.stok, stokOnce + 25);

  const tekrar = await admin.put(`/api/siparisler/${siparis.data.id}/durum`, { durum: 'iptal' });
  assert.equal(tekrar.status, 400);
});

test('ayni tarihe iki nobet kaydi eklenemez', async () => {
  assert.equal((await admin.post('/api/nobetler', { tarih: '2030-01-15' })).status, 201);
  assert.equal((await admin.post('/api/nobetler', { tarih: '2030-01-15' })).status, 409);
});

test('gorev olusturulup tamamlanabilir', async () => {
  const g = await kasiyer.post('/api/gorevler', { baslik: 'SKT kontrolu', oncelik: 'yuksek' });
  assert.equal(g.status, 201);
  const t = await kasiyer.put(`/api/gorevler/${g.data.id}`, { durum: 'tamamlandi' });
  assert.equal(t.data.durum, 'tamamlandi');
  assert.ok(t.data.tamamlanma_tarihi);
});

test('yedek disa aktarilip geri yuklenebilir', async () => {
  const yedek = (await admin.get('/api/yedekleme/export')).data;
  await admin.post('/api/musteriler', { ad_soyad: 'Gecici' });
  const sayiOnce = (await admin.get('/api/musteriler')).data.length;

  assert.equal((await admin.post('/api/yedekleme/import', yedek)).status, 200);
  assert.equal((await admin.get('/api/musteriler')).data.length, sayiOnce - 1);
});
