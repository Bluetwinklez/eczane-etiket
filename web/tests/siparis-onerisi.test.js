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

test('satis hizina gore: yakinda bitecek urun onerilir, adet 30 gunluk ihtiyaca tamamlanir', async () => {
  const hizli = (await admin.post('/api/ilaclar', { ad: 'Hizli Satan', satis_fiyati: 10, kritik_stok: 2, stok: 30 })).data;
  const yavas = (await admin.post('/api/ilaclar', { ad: 'Yavas Satan', satis_fiyati: 10, kritik_stok: 2, stok: 20 })).data;
  await admin.post('/api/satislar', { kalemler: [{ ilac_id: hizli.id, adet: 25 }, { ilac_id: yavas.id, adet: 5 }] });

  const oneriler = (await admin.get('/api/siparisler/oneriler')).data;
  const h = oneriler.find((o) => o.ilac_id === hizli.id);
  assert.ok(h, 'stok 5, gunde ~0.83 satis -> 6 gun yeter (<7)');
  assert.equal(h.neden, 'hizli_tukeniyor');
  assert.equal(h.yetecek_gun, 6);
  assert.equal(h.onerilen_adet, 20, 'ceil(25/30*30)=25 ihtiyac - 5 stok');
  assert.ok(!oneriler.some((o) => o.ilac_id === yavas.id), '15 stok, gunde 0.17 -> 90 gun yeter');

  const genis = (await admin.get('/api/siparisler/oneriler?temin_gun=60')).data;
  assert.ok(!genis.some((o) => o.ilac_id === yavas.id), '90 gun > 60');
});

test('stoga alinan iade satis hizini dusurur', async () => {
  const u = (await admin.post('/api/ilaclar', { ad: 'Iadeli', satis_fiyati: 10, kritik_stok: 1, stok: 30 })).data;
  const s = (await admin.post('/api/satislar', { kalemler: [{ ilac_id: u.id, adet: 26 }] })).data;
  assert.ok((await admin.get('/api/siparisler/oneriler')).data.some((o) => o.ilac_id === u.id));
  await admin.post('/api/iadeler', { satis_id: s.id, kalemler: [{ satis_kalem_id: s.kalemler[0].id, adet: 20 }] });
  const r = (await admin.get('/api/siparisler/stok-yeterlilik')).data.find((x) => x.ilac_id === u.id);
  assert.equal(r.son_satis, 6);
  assert.equal(r.stok, 24);
  assert.ok(!(await admin.get('/api/siparisler/oneriler')).data.some((o) => o.ilac_id === u.id));
});
