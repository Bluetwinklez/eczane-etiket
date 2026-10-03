const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;
let kasiyer;
const XANAX = 8; // ornek katalogda yesil receteli

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

test('yesil receteli ilac recete bilgisi olmadan satilamaz', async () => {
  const k = [{ ilac_id: XANAX, adet: 1 }];
  let r = await kasiyer.post('/api/satislar', { kalemler: k });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /recete turunu/);
  r = await kasiyer.post('/api/satislar', { kalemler: k, recete_turu: 'beyaz', recete_no: 'X', doktor_adi: 'Dr', hasta_tc: '12345678901' });
  assert.equal(r.status, 400, 'yanlis renk');
  r = await kasiyer.post('/api/satislar', { kalemler: k, recete_turu: 'yesil', recete_no: 'Y1' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /doktor ve hasta TC/);
  r = await kasiyer.post('/api/satislar', { kalemler: k, recete_turu: 'yesil', recete_no: 'Y1', doktor_adi: 'Dr. A', hasta_tc: '123' });
  assert.equal(r.status, 400, 'gecersiz TC');
});

test('recete bilgisiyle satis yapilir; TC kayitli musteriden alinir; kontrollu ilac defterine duser', async () => {
  const s = await kasiyer.post('/api/satislar', {
    musteri_id: 1, // TC'si kayitli
    kalemler: [{ ilac_id: XANAX, adet: 2 }, { ilac_id: 1, adet: 1 }],
    recete_turu: 'yesil',
    recete_no: 'YR-2026-001',
    doktor_adi: 'Dr. Ayse Demir',
    recete_tarihi: '2026-10-01'
  });
  assert.equal(s.status, 201);
  assert.equal(s.data.hasta_tc, '12345678901');
  assert.equal(s.data.recete_no, 'YR-2026-001');

  await admin.post('/api/iadeler', { satis_id: s.data.id, kalemler: [{ satis_kalem_id: s.data.kalemler.find((x) => x.ilac_id === XANAX).id, adet: 1 }] });

  const defter = (await admin.get('/api/raporlar/kontrollu-ilac')).data;
  assert.ok(defter.every((r) => r.ilac_adi.startsWith('Xanax')), 'yalnizca kontrollu ilaclar');
  const satis = defter.find((r) => r.recete_no === 'YR-2026-001');
  assert.equal(satis.cikis, 2);
  assert.equal(satis.doktor, 'Dr. Ayse Demir');
  assert.equal(satis.hasta, 'Ahmet Yilmaz');
  const iade = defter[defter.length - 1];
  assert.equal(iade.giris, 1);
  const stok = (await admin.get(`/api/ilaclar/${XANAX}`)).data.stok;
  assert.equal(iade.bakiye, stok, 'yuruyen bakiye guncel stokla biter');
  assert.equal(satis.bakiye, stok - 1);

  const sgk = (await admin.get('/api/raporlar/recete-sgk')).data;
  assert.ok(sgk.some((r) => r.recete_no === 'YR-2026-001'));
  assert.equal((await kasiyer.get('/api/raporlar/kontrollu-ilac')).status, 403);
});

test('ilac kartinda recete turu ayarlanir; gecersiz tur reddedilir; ozel recete receteli yapar', async () => {
  const u = (await admin.post('/api/ilaclar', { ad: 'Narkotik Test', satis_fiyati: 10, recete_turu: 'kirmizi' })).data;
  assert.equal(u.recete_turu, 'kirmizi');
  assert.equal(u.receteli, 1);
  assert.equal((await admin.post('/api/ilaclar', { ad: 'X', satis_fiyati: 1, recete_turu: 'pembe' })).status, 400);
  const g = (await admin.put(`/api/ilaclar/${u.id}`, { ad: 'Narkotik Test', satis_fiyati: 10, recete_turu: '' })).data;
  assert.equal(g.recete_turu, null);
  const korunan = (await admin.put(`/api/ilaclar/${XANAX}`, { ad: 'Xanax 0.5mg 30 Tablet', satis_fiyati: 49, receteli: true })).data;
  assert.equal(korunan.recete_turu, 'yesil', 'gonderilmezse korunur');
});
