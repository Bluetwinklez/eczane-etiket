const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { sureSaat } = require('../server/routes/vardiyalar');

let sunucu;
let admin;
let kasiyer;
let personel;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  personel = (await admin.get('/api/vardiyalar?hafta=2026-10-07')).data.personel;
});
after(() => sunucu.kapat());

test('sure hesabi gece yarisini gecen vardiyayi sayar', () => {
  assert.equal(sureSaat('08:30', '17:00'), 8.5);
  assert.equal(sureSaat('17:00', '00:00'), 7);
  assert.equal(sureSaat('08:30', '08:30'), 24);
});

test('haftalik cizelge: pazartesiden baslar, toplam saat, izin sayilmaz', async () => {
  const k = personel.find((p) => p.rol === 'kasiyer');
  await admin.put('/api/vardiyalar', { kullanici_id: k.id, tarih: '2026-10-05', baslangic: '08:30', bitis: '17:00' });
  await admin.put('/api/vardiyalar', { kullanici_id: k.id, tarih: '2026-10-06', baslangic: '08:30', bitis: '08:30' });
  await admin.put('/api/vardiyalar', { kullanici_id: k.id, tarih: '2026-10-07', tip: 'izin' });
  const v = (await kasiyer.get('/api/vardiyalar?hafta=2026-10-08')).data;
  assert.equal(v.hafta, '2026-10-05', 'carsamba verilse de haftanin pazartesisi');
  assert.equal(v.gunler.length, 7);
  assert.equal(v.toplam_saat[k.id], 32.5);
  // Ayni gune ikinci kayit gunceller
  await admin.put('/api/vardiyalar', { kullanici_id: k.id, tarih: '2026-10-05', baslangic: '12:00', bitis: '21:00' });
  assert.equal((await kasiyer.get('/api/vardiyalar?hafta=2026-10-05')).data.toplam_saat[k.id], 33);
});

test('dogrulama ve yetki', async () => {
  const k = personel[0];
  assert.equal((await kasiyer.put('/api/vardiyalar', { kullanici_id: k.id, tarih: '2026-10-05', baslangic: '08:00', bitis: '16:00' })).status, 403);
  assert.equal((await admin.put('/api/vardiyalar', { kullanici_id: k.id, tarih: '2026-10-05', baslangic: '8:00', bitis: '16:00' })).status, 400);
  assert.equal((await admin.put('/api/vardiyalar', { kullanici_id: 9999, tarih: '2026-10-05', tip: 'izin' })).status, 404);
});

test('onceki haftayi kopyalama dolu gunlere dokunmaz; silme', async () => {
  const k = personel.find((p) => p.rol === 'kasiyer');
  await admin.put('/api/vardiyalar', { kullanici_id: k.id, tarih: '2026-10-13', tip: 'rapor' });
  const r = (await admin.post('/api/vardiyalar/kopyala', { kaynak_hafta: '2026-10-05', hedef_hafta: '2026-10-12' })).data;
  assert.equal(r.eklenen, 2);
  assert.equal(r.atlanan, 1, '13 Ekim zaten dolu (rapor)');
  const hafta = (await admin.get('/api/vardiyalar?hafta=2026-10-12')).data;
  assert.equal(hafta.vardiyalar.find((v) => v.tarih === '2026-10-13').tip, 'rapor');
  assert.equal((await admin.del(`/api/vardiyalar?kullanici_id=${k.id}&tarih=2026-10-13`)).status, 204);
});

test('devir notlari: herkes ekler, tamamlandi isaretlenir', async () => {
  const n = (await kasiyer.post('/api/vardiyalar/notlar', { metin: 'Ahmet beyin ilaci 15:00 te gelecek' })).data;
  assert.equal((await kasiyer.post('/api/vardiyalar/notlar', { metin: ' ' })).status, 400);
  await admin.put(`/api/vardiyalar/notlar/${n.id}`, { tamamlandi: true });
  const liste = (await kasiyer.get('/api/vardiyalar/notlar')).data;
  assert.equal(liste.find((x) => x.id === n.id).tamamlandi, 1);
});
