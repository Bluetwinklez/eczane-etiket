const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');

let sunucu;
let admin;

const gunOnce = (gun) => new Date(Date.now() - gun * 86400000).toISOString().slice(0, 19).replace('T', ' ');

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
});
after(() => sunucu.kapat());

async function takipliMusteri(ad, telefon) {
  const musteri = (await admin.post('/api/musteriler', { ad_soyad: ad, telefon })).data.id;
  const ilac = (await admin.post('/api/ilaclar', { ad: `${ad} Ilaci`, satis_fiyati: 10, kutu_gun: 30, stok: 5 })).data.id;
  const satis = await admin.post('/api/satislar', { musteri_id: musteri, kalemler: [{ ilac_id: ilac, adet: 1 }] });
  db.prepare('UPDATE satislar SET tarih = ? WHERE id = ?').run(gunOnce(27), satis.data.id);
  return { musteri, ilac };
}

test('whatsapp kanali mesaji dondurur, donemi isaretler ve bildirim kaydi olusturmaz', async () => {
  const { musteri, ilac } = await takipliMusteri('Wa Hasta', '05321112233');
  const once = db.prepare('SELECT COUNT(*) AS n FROM bildirimler').get().n;
  const r = await admin.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: musteri, ilac_id: ilac, kanal: 'whatsapp' });
  assert.equal(r.status, 201);
  assert.equal(r.data.bildirim.durum, 'whatsapp');
  assert.match(r.data.bildirim.mesaj, /Wa Hasta Ilaci/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bildirimler').get().n, once);

  const kayit = (await admin.get('/api/hatirlatmalar/ilac-bitis?gun=7')).data.find((x) => x.ilac_id === ilac);
  assert.ok(kayit.hatirlatildi);
  const tekrar = await admin.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: musteri, ilac_id: ilac, kanal: 'sms' });
  assert.equal(tekrar.status, 409);
});

test('whatsapp icin telefon gerekir; gecersiz kanal reddedilir', async () => {
  const { musteri, ilac } = await takipliMusteri('Telefonsuz', '');
  const r = await admin.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: musteri, ilac_id: ilac, kanal: 'whatsapp' });
  assert.equal(r.status, 400);
  const k = await admin.post('/api/hatirlatmalar/ilac-bitis/gonder', { musteri_id: musteri, ilac_id: ilac, kanal: 'faks' });
  assert.equal(k.status, 400);
});
