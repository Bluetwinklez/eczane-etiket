const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci, istemci } = require('./helpers');

let sunucu;
let admin; // merkez sube (1) yetkilisi
let sube2; // 2. subedeki eczaci

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  const k = await admin.post('/api/kullanicilar', {
    kullanici_adi: 'eczaci2', sifre: 'IlkSifre2026', ad_soyad: 'Sube Iki', rol: 'eczaci', sube_id: 2
  });
  assert.equal(k.status, 201);
  sube2 = istemci(sunucu.base);
  await sube2.girisYap('eczaci2', 'IlkSifre2026');
  await sube2.post('/api/auth/sifre-degistir', { mevcut_sifre: 'IlkSifre2026', yeni_sifre: 'YeniSifre2026' });
});
after(() => sunucu.kapat());

async function stok(c, ilacId) {
  return (await c.get(`/api/ilaclar/${ilacId}`)).data.stok;
}

test('transfer: kaynaktan FEFO ile duser, teslimde hedefe ayni parti/SKT ile girer', async () => {
  const ilac = (await admin.post('/api/ilaclar', { ad: 'Transfer Test', satis_fiyati: 10 })).data;
  await admin.post(`/api/ilaclar/${ilac.id}/stok`, { tip: 'giris', adet: 4, parti_no: 'ERKEN', skt: '2029-01-01' });
  await admin.post(`/api/ilaclar/${ilac.id}/stok`, { tip: 'giris', adet: 10, parti_no: 'GEC', skt: '2031-01-01' });

  assert.equal((await admin.post('/api/transferler', { hedef_sube_id: 2, kalemler: [{ ilac_id: ilac.id, adet: 50 }] })).status, 400, 'yetersiz stok');
  assert.equal((await admin.post('/api/transferler', { hedef_sube_id: 1, kalemler: [{ ilac_id: ilac.id, adet: 1 }] })).status, 400, 'ayni sube');

  const t = (await admin.post('/api/transferler', { hedef_sube_id: 2, kalemler: [{ ilac_id: ilac.id, adet: 6 }] })).data;
  assert.equal(t.durum, 'yolda');
  assert.deepEqual(t.kalemler.map((k) => [k.parti_no, k.adet]), [['ERKEN', 4], ['GEC', 2]]);
  assert.equal(await stok(admin, ilac.id), 8, 'kaynaktan hemen duser');
  assert.equal(await stok(sube2, ilac.id), 0, 'teslimden once hedefe girmez');

  // Gonderen sube teslim alamaz (admin haric herkes icin kural); alici sube alir
  const teslim = await sube2.post(`/api/transferler/${t.id}/teslim-al`, {});
  assert.equal(teslim.status, 200);
  assert.equal(teslim.data.durum, 'teslim_alindi');
  assert.equal(await stok(sube2, ilac.id), 6);
  const partiler = (await sube2.get(`/api/ilaclar/${ilac.id}/partiler`)).data;
  assert.deepEqual(partiler.map((p) => [p.parti_no, p.skt, p.miktar]), [['ERKEN', '2029-01-01', 4], ['GEC', '2031-01-01', 2]]);

  assert.equal((await sube2.post(`/api/transferler/${t.id}/iptal`, {})).status, 400, 'sonuclanmis transfer');
});

test('iptal: urunler gonderen subeye geri doner; alici iptal edemez', async () => {
  const once = await stok(admin, 2);
  const t = (await admin.post('/api/transferler', { hedef_sube_id: 2, kalemler: [{ ilac_id: 2, adet: 3 }] })).data;
  assert.equal(await stok(admin, 2), once - 3);
  assert.equal((await sube2.post(`/api/transferler/${t.id}/iptal`, {})).status, 403);
  assert.equal((await admin.post(`/api/transferler/${t.id}/iptal`, {})).data.durum, 'iptal');
  assert.equal(await stok(admin, 2), once);
});

test('subeler yalnizca kendi transferlerini gorur', async () => {
  const t = (await sube2.post('/api/transferler', { hedef_sube_id: 1, kalemler: [{ ilac_id: 2, adet: 1 }] })).data;
  assert.ok(t.id);
  const liste = (await sube2.get('/api/transferler')).data;
  assert.ok(liste.every((x) => x.kaynak_sube_id === 2 || x.hedef_sube_id === 2));
  assert.equal((await sube2.get('/api/transferler/subeler')).status, 200);
});
