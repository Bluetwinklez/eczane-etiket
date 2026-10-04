const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');

let sunucu;
let admin;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

function oge(r, kod) {
  return r.ogeler.find((o) => o.kod === kod);
}

test('ornek verideki kritik stok ve SKT uyarilari gorunur, en ciddiler once', async () => {
  const r = (await admin.get('/api/bildirim-merkezi')).data;
  assert.ok(oge(r, 'kritik_stok'), 'Beloc Zok kritik');
  assert.ok(oge(r, 'skt_gecmis'), 'ornek veride SKTsi gecmis partiler var');
  assert.equal(r.ogeler[0].seviye, 'danger');
  assert.equal(r.toplam, r.ogeler.reduce((t, o) => t + o.sayi, 0));
});

test('istek geldi, devir notu, acik sayim ve gelen transfer sayilir; kasiyer yonetici ogelerini gormez', async () => {
  const ilac = (await admin.post('/api/ilaclar', { ad: 'Bildirim Test', satis_fiyati: 5 })).data;
  await kasiyer.post('/api/istekler', { musteri_id: 1, ilac_id: ilac.id });
  assert.ok(!oge((await kasiyer.get('/api/bildirim-merkezi')).data, 'istek_geldi'));
  await admin.post(`/api/ilaclar/${ilac.id}/stok`, { tip: 'giris', adet: 1 });
  assert.equal(oge((await kasiyer.get('/api/bildirim-merkezi')).data, 'istek_geldi').sayi, 1);

  await kasiyer.post('/api/vardiyalar/notlar', { metin: 'Kasa bozuk para azaldi' });
  await admin.post('/api/sayimlar', {});
  const k = (await kasiyer.get('/api/bildirim-merkezi')).data;
  assert.equal(oge(k, 'devir_notu').sayi, 1);
  assert.ok(!oge(k, 'sayim_acik'), 'kasiyer yonetici ogelerini gormez');
  assert.equal(oge((await admin.get('/api/bildirim-merkezi')).data, 'sayim_acik').sayi, 1);
});

test('dun satis yapilip kasa kapatilmadiysa uyarir', async () => {
  const s = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 1 }] })).data;
  db.prepare("UPDATE satislar SET tarih = datetime('now', '-1 day') WHERE id = ?").run(s.id);
  assert.equal(oge((await kasiyer.get('/api/bildirim-merkezi')).data, 'kasa_acik').sayi, 1);
  const dun = db.prepare("SELECT date('now', '-1 day') AS d").get().d;
  await kasiyer.post('/api/kasa-kapanislari', { tarih: dun, nakit_sayilan: 0 });
  assert.ok(!oge((await kasiyer.get('/api/bildirim-merkezi')).data, 'kasa_acik'));
});
