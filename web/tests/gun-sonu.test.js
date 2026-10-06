const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const G = require('../server/gunSonuOzeti');
const { yerelSimdi } = require('../server/zaman');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
});

test('gün sonu özeti: önizleme, ayarlar ve saatinde bir kez gönderim', async () => {
  const admin = await girisliIstemci(sunucu.base, 'admin');
  const kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  const ilac = (await kasiyer.get('/api/ilaclar')).data.find((i) => /Parol/.test(i.ad));
  await kasiyer.post('/api/satislar', { odeme_tipi: 'nakit', kalemler: [{ ilac_id: ilac.id, adet: 3 }] });
  await kasiyer.post('/api/satislar', { odeme_tipi: 'kredi_karti', kalemler: [{ ilac_id: ilac.id, adet: 1 }] });

  assert.equal((await kasiyer.get('/api/gun-sonu/onizleme')).status, 403);
  const o = (await admin.get('/api/gun-sonu/onizleme')).data;
  assert.equal(o.ozet.satis_adedi, 2);
  assert.equal(o.ozet.brut_hasilat, Math.round(ilac.satis_fiyati * 4 * 100) / 100);
  assert.equal(o.ozet.kasa.nakit, Math.round(ilac.satis_fiyati * 3 * 100) / 100);
  assert.equal(o.ozet.en_cok_satanlar[0].ad, ilac.ad);
  assert.match(o.konu, /Eczam gün sonu/);
  assert.match(o.metin, /En çok satanlar:\n {2}1\. Parol/);
  assert.match(o.html, /<h2/);

  // Ayarlar
  assert.equal((await kasiyer.put('/api/gun-sonu/ayar', { aktif: true })).status, 403);
  assert.equal((await admin.put('/api/gun-sonu/ayar', { adres: 'yanlis' })).status, 400);
  assert.equal((await admin.put('/api/gun-sonu/ayar', { saat: '25:00' })).status, 400);
  const a = (await admin.put('/api/gun-sonu/ayar', { aktif: true, adres: 'sahip@ornek.com', saat: '20:30' })).data;
  assert.equal(a.aktif, true);
  assert.equal(a.smtp, false);

  // SMTP yokken elle gonderim simule edilir
  assert.equal((await admin.post('/api/gun-sonu/gonder', {})).data.durum, 'simule');

  // Zamanlayici: saat gelmeden gondermez, gelince bir kez gonderir
  const giden = [];
  const sahte = { sendMail: async (m) => giden.push(m) };
  const gun = yerelSimdi().toISOString().slice(0, 10);
  assert.equal(await G.zamaniGeldiyseGonder(new Date(`${gun}T19:00:00Z`), sahte), null);
  const r = await G.zamaniGeldiyseGonder(new Date(`${gun}T21:05:00Z`), sahte);
  assert.equal(r[0].durum, 'gonderildi');
  assert.equal(giden[0].to, 'sahip@ornek.com');
  assert.match(giden[0].subject, /hasılat/);
  assert.equal(await G.zamaniGeldiyseGonder(new Date(`${gun}T22:00:00Z`), sahte), null, 'aynı gün ikinci kez gönderilmez');
  assert.equal(G.ayarlariOku().son_durum, 'gonderildi');
});
