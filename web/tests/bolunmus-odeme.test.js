const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
let admin;

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
});
after(() => sunucu.kapat());

test('bolunmus odeme: toplam tutmazsa reddedilir', async () => {
  const govde = { odeme_tipi: 'karma', kalemler: [{ ilac_id: 1, adet: 2 }] }; // 49.80
  assert.equal((await admin.post('/api/satislar', { ...govde, odemeler: [{ odeme_tipi: 'nakit', tutar: 49.8 }] })).status, 400, 'tek parca');
  assert.equal((await admin.post('/api/satislar', { ...govde, odemeler: [{ odeme_tipi: 'nakit', tutar: 20 }, { odeme_tipi: 'kredi_karti', tutar: 20 }] })).status, 400);
  assert.equal((await admin.post('/api/satislar', { ...govde, odemeler: [{ odeme_tipi: 'nakit', tutar: 20 }, { odeme_tipi: 'sgk', tutar: 29.8 }] })).status, 400);
});

test('bolunmus odeme kasa ozetine nakit ve kart olarak dagilir; iade oranla duser', async () => {
  const once = (await admin.get('/api/kasa-kapanislari/ozet')).data;
  const satis = await admin.post('/api/satislar', {
    odeme_tipi: 'karma',
    kalemler: [{ ilac_id: 1, adet: 4 }], // 99.60
    odemeler: [{ odeme_tipi: 'nakit', tutar: 39.6 }, { odeme_tipi: 'kredi_karti', tutar: 60 }]
  });
  assert.equal(satis.status, 201);
  assert.equal(satis.data.odemeler.length, 2);

  let ozet = (await admin.get('/api/kasa-kapanislari/ozet')).data;
  assert.ok(Math.abs(ozet.nakit - once.nakit - 39.6) < 0.001);
  assert.ok(Math.abs(ozet.kart - once.kart - 60) < 0.001);
  assert.ok(Math.abs(ozet.toplam - once.toplam - 99.6) < 0.001);

  // 4 kutunun 2'si iade: 49.80; nakit payi %39.76 -> 19.80, kart 30.00
  await admin.post('/api/iadeler', { satis_id: satis.data.id, kalemler: [{ satis_kalem_id: satis.data.kalemler[0].id, adet: 2 }] });
  ozet = (await admin.get('/api/kasa-kapanislari/ozet')).data;
  assert.ok(Math.abs(ozet.nakit - once.nakit - 19.8) < 0.011);
  assert.ok(Math.abs(ozet.kart - once.kart - 30) < 0.011);
  assert.ok(Math.abs(ozet.toplam - once.toplam - 49.8) < 0.001);
});
