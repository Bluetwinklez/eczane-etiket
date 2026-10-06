const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { xlsxYap } = require('./xlsxYap');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
});

const yukle = (c, govde, sorgu = '') =>
  fetch(`${sunucu.base}/api/fiyat-listesi/yukle${sorgu}`, { method: 'POST', headers: { Cookie: c.cerez(), 'Content-Type': 'application/octet-stream' }, body: govde }).then(async (r) => ({ status: r.status, data: await r.json() }));

test('fiyat listesi: Excel/CSV okunur, farklar gösterilir, uygulanınca satış fiyatı ve etiket listesi güncellenir', async () => {
  const admin = await girisliIstemci(sunucu.base, 'admin');
  const kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  const ilaclar = (await admin.get('/api/ilaclar')).data;
  const parol = ilaclar.find((i) => /Parol/.test(i.ad));
  const beloc = ilaclar.find((i) => /Beloc/.test(i.ad));
  const aspirin = ilaclar.find((i) => /Aspirin/.test(i.ad));

  // Excel: ustte baslik disi satirlar, Turkce sutun adlari, virgullu fiyat
  const xlsx = xlsxYap([{ ad: 'Liste', satirlar: [
    ['DEPO FİYAT LİSTESİ 06.10.2026'],
    [],
    ['Ürün Adı', 'Barkod', 'Depocu Satış Fiyatı', 'Perakende Satış Fiyatı (KDV Dahil)'],
    [parol.ad, parol.barkod, '20,10', '26,40'],
    [beloc.ad, beloc.barkod, '30', String(beloc.satis_fiyati).replace('.', ',')],
    ['Katalogda olmayan', '8690000009999', '10', '12,00'],
    ['Bozuk', 'abc', '1', '2']
  ] }]);
  assert.equal((await yukle(kasiyer, xlsx)).status, 403, 'kasiyer yükleyemez');
  const r = await yukle(admin, xlsx);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.satir, 3);
  assert.equal(r.data.eslesen, 2);
  assert.deepEqual(r.data.sutunlar.sort(), ['barkod', 'depocu_fiyati', 'psf'].sort());
  assert.deepEqual(r.data.uygulanan, []);
  const fark = r.data.farklar.find((f) => f.id === parol.id);
  assert.equal(fark.liste_psf, 26.4);
  assert.equal(fark.fark, Math.round((26.4 - parol.satis_fiyati) * 100) / 100);
  assert.ok(!r.data.farklar.some((f) => f.id === beloc.id), 'aynı fiyat fark sayılmaz');
  assert.equal((await admin.get(`/api/ilac-bilgi/${parol.id}`)).data.bilgi.depocu_fiyati, 20.1);

  // Bildirim zili
  const zil = (await admin.get('/api/bildirim-merkezi')).data;
  assert.equal((zil.ogeler || zil).find((o) => o.kod === 'fiyat_farki').sayi, 1);

  // Uygula
  assert.equal((await kasiyer.post('/api/fiyat-listesi/uygula', { idler: [parol.id] })).status, 403);
  const u = await admin.post('/api/fiyat-listesi/uygula', { idler: [parol.id, 999999] });
  assert.deepEqual(u.data.uygulanan, [parol.id]);
  assert.equal((await admin.get(`/api/ilaclar/${parol.id}`)).data.satis_fiyati, 26.4);
  assert.ok((await admin.get('/api/ilaclar/fiyat-degisenler?gun=1')).data.some((d) => d.ilac_id === parol.id), 'etiket "fiyatı değişenler" listesine girer');
  assert.equal((await admin.get('/api/fiyat-listesi/farklar')).data.length, 0);

  // CSV + otomatik uygulama
  const csv = `barkod;psf\n${aspirin.barkod};40,50\n`;
  const o = await yukle(admin, Buffer.from(csv), '?otomatik=1');
  assert.equal(o.status, 200, JSON.stringify(o.data));
  assert.deepEqual(o.data.uygulanan, [aspirin.id]);
  assert.equal((await admin.get(`/api/ilaclar/${aspirin.id}`)).data.satis_fiyati, 40.5);

  const bozuk = await yukle(admin, Buffer.from('ad;fiyat\nx;1\n'));
  assert.equal(bozuk.status, 400);
  assert.match(bozuk.data.error, /Barkod ve fiyat/);
});
