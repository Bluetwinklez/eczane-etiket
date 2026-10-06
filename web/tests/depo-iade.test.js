const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
});

const gunSonra = (g) => new Date(Date.now() + g * 86400000).toISOString().slice(0, 10);

test('depoya iade: miadı yaklaşan partiler depoya göre gruplanır, iade stoktan düşer ve cariye işlenir', async () => {
  const admin = await girisliIstemci(sunucu.base, 'admin');
  const kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  const ilac = (await admin.post('/api/ilaclar', { ad: 'İade Test 10 mg', barkod: '8690000012345', satis_fiyati: 50 })).data;
  const ted = (await admin.get('/api/tedarikciler')).data[0];
  const mk = await admin.post('/api/mal-kabul', {
    tedarikci_id: ted.id,
    kalemler: [
      { ilac_id: ilac.id, adet: 10, mf: 2, alis_fiyati: 24, parti_no: 'YAKIN1', skt: gunSonra(40) },
      { ilac_id: ilac.id, adet: 5, alis_fiyati: 24, parti_no: 'UZAK1', skt: gunSonra(600) }
    ]
  });
  assert.equal(mk.status, 201, JSON.stringify(mk.data));

  const a = (await admin.get('/api/depo-iade/adaylar?gun=120')).data;
  const g = a.gruplar.find((x) => x.tedarikci_id === ted.id);
  assert.ok(g, 'mal kabul deposu altında');
  const k = g.kalemler.find((x) => x.ilac_id === ilac.id);
  assert.equal(k.parti_no, 'YAKIN1');
  assert.equal(k.miktar, 12, 'MF dahil');
  assert.equal(k.birim_maliyet, 20, 'mal kabuldeki birim maliyet (24*10/12)');
  assert.equal(k.eslesme, 'parti');
  assert.ok(k.kalan_gun >= 39 && k.kalan_gun <= 40);
  assert.ok(!g.kalemler.some((x) => x.parti_no === 'UZAK1'), 'uzak miadlı parti listelenmez');

  assert.equal((await kasiyer.post('/api/depo-iade', { tedarikci_id: ted.id, kalemler: [{ parti_id: k.parti_id, adet: 1 }] })).status, 403);
  assert.equal((await admin.post('/api/depo-iade', { tedarikci_id: ted.id, kalemler: [{ parti_id: k.parti_id, adet: 13 }] })).status, 400);
  assert.equal((await admin.post('/api/depo-iade', { tedarikci_id: ted.id, kalemler: [] })).status, 400);

  const stokOnce = (await admin.get(`/api/ilaclar/${ilac.id}`)).data.stok;
  const r = await admin.post('/api/depo-iade', { tedarikci_id: ted.id, belge_no: 'IA-7', kalemler: [{ parti_id: k.parti_id, adet: 8 }] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.toplam, 160);
  assert.equal((await admin.get(`/api/ilaclar/${ilac.id}`)).data.stok, stokOnce - 8);

  const form = (await admin.get(`/api/depo-iade/${r.data.id}`)).data;
  assert.equal(form.firma_adi, ted.firma_adi);
  assert.equal(form.belge_no, 'IA-7');
  assert.deepEqual(form.kalemler.map((x) => [x.parti_no, x.adet, x.tutar]), [['YAKIN1', 8, 160]]);
  assert.equal((await admin.get('/api/depo-iade')).data[0].adet, 8);

  // Kalan 4 adet hâlâ aday; cari hareketi iade olarak islendi
  const a2 = (await admin.get('/api/depo-iade/adaylar?gun=120')).data;
  assert.equal(a2.gruplar.flatMap((x) => x.kalemler).find((x) => x.parti_id === k.parti_id).miktar, 4);
  const cari = (await admin.get(`/api/tedarikciler/${ted.id}/cari`)).data;
  const liste = Array.isArray(cari) ? cari : cari.hareketler;
  assert.ok(liste.some((h) => h.odeme_sekli === 'iade' && h.tutar === 160), 'tedarikçi carisinde iade');
});
