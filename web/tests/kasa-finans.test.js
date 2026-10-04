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

test('kasa giriş/çıkışı beklenen nakdi değiştirir, ciroyu değiştirmez; X raporu', async () => {
  const s = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 2 }] })).data; // nakit
  assert.equal((await kasiyer.post('/api/kasa-kapanislari/hareketler', { tip: 'giris', tutar: 0, aciklama: 'x' })).status, 400);
  assert.equal((await kasiyer.post('/api/kasa-kapanislari/hareketler', { tip: 'giris', tutar: 10 })).status, 400);
  await kasiyer.post('/api/kasa-kapanislari/hareketler', { tip: 'giris', tutar: 100, aciklama: 'Bozuk para' });
  const cikis = (await kasiyer.post('/api/kasa-kapanislari/hareketler', { tip: 'cikis', tutar: 30, aciklama: 'Kargo' })).data;
  const ozet = (await kasiyer.get('/api/kasa-kapanislari/ozet')).data;
  assert.equal(ozet.nakit, Math.round((s.toplam_tutar + 70) * 100) / 100);
  assert.equal(ozet.toplam, s.toplam_tutar);
  assert.equal(ozet.kasa_giris, 100);
  assert.equal(ozet.kasa_cikis, 30);

  const x = (await kasiyer.get('/api/kasa-kapanislari/x-raporu')).data;
  assert.equal(x.satis_adedi, 1);
  assert.equal(x.hareketler.length, 2);
  assert.equal(x.personel[0].adet, 1);
  assert.equal(x.saatlik.reduce((t, r) => t + r.adet, 0), 1);

  // Kasa kapandiktan sonra hareket eklenemez/silinemez
  await kasiyer.post('/api/kasa-kapanislari', { nakit_sayilan: ozet.nakit });
  const kap = db.prepare('SELECT kasa_giris_sistem, kasa_cikis_sistem FROM kasa_kapanislari ORDER BY id DESC LIMIT 1').get();
  assert.deepEqual({ ...kap }, { kasa_giris_sistem: 100, kasa_cikis_sistem: 30 });
  assert.equal((await kasiyer.post('/api/kasa-kapanislari/hareketler', { tip: 'giris', tutar: 5, aciklama: 'geç' })).status, 409);
  assert.equal((await kasiyer.del('/api/kasa-kapanislari/hareketler/' + cikis.id)).status, 409);
});

test('kasiyer indirim limiti: yönetici ayarlar, kasiyer aşamaz', async () => {
  assert.equal((await kasiyer.put('/api/ayarlar', { kasiyer_indirim_limiti: 50 })).status, 403);
  assert.equal((await admin.put('/api/ayarlar', { kasiyer_indirim_limiti: 150 })).status, 400);
  assert.equal((await admin.put('/api/ayarlar', { kasiyer_indirim_limiti: 5 })).data.kasiyer_indirim_limiti, 5);
  assert.equal((await kasiyer.get('/api/ayarlar')).data.kasiyer_indirim_limiti, 5);
  const red = await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 1 }], indirim_yuzdesi: 6 });
  assert.equal(red.status, 403);
  assert.match(red.data.error, /%5/);
  assert.equal((await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 1 }], indirim_yuzdesi: 5 })).status, 201);
  assert.equal((await admin.post('/api/satislar', { kalemler: [{ ilac_id: 1, adet: 1 }], indirim_yuzdesi: 30 })).status, 201);
  await admin.put('/api/ayarlar', { kasiyer_indirim_limiti: 10 });
});

test('tedarikçi cari: mal kabul faturası borç olur, ödemeler vadeye göre kapatır', async () => {
  assert.equal((await kasiyer.post('/api/tedarikciler', { firma_adi: 'X' })).status, 403);
  assert.equal((await kasiyer.del('/api/tedarikciler/1')).status, 403);
  const t = (await admin.post('/api/tedarikciler', { firma_adi: 'Vadeli Depo', vade_gun: 45 })).data;
  assert.equal(t.vade_gun, 45);
  await admin.post('/api/mal-kabul', { tedarikci_id: t.id, fatura_no: 'F-1', fatura_tarihi: '2026-01-10', kalemler: [{ ilac_id: 1, adet: 10, alis_fiyati: 10 }] });
  await admin.post(`/api/tedarikciler/${t.id}/hareketler`, { tip: 'fatura', tutar: 50, belge_no: 'F-2', belge_tarihi: '2026-02-01' });
  let c = (await admin.get(`/api/tedarikciler/${t.id}/cari`)).data;
  assert.equal(c.bakiye, 150);
  assert.equal(c.acik_faturalar[0].belge_no, 'F-1');
  assert.equal(c.acik_faturalar[0].vade_tarihi, '2026-02-24');

  await admin.post(`/api/tedarikciler/${t.id}/hareketler`, { tip: 'odeme', tutar: 120, odeme_sekli: 'havale' });
  c = (await admin.get(`/api/tedarikciler/${t.id}/cari`)).data;
  assert.equal(c.bakiye, 30);
  assert.deepEqual(c.acik_faturalar.map((f) => [f.belge_no, f.kalan]), [['F-2', 30]]);
  assert.equal((await admin.post(`/api/tedarikciler/${t.id}/hareketler`, { tip: 'odeme', tutar: 5, odeme_sekli: 'bitcoin' })).status, 400);

  const v = (await admin.get('/api/tedarikciler/vadeler/liste?gun=30')).data;
  assert.ok(v.liste.some((f) => f.belge_no === 'F-2' && f.gecikmis));
  const zil = (await admin.get('/api/bildirim-merkezi')).data;
  assert.ok((zil.ogeler || zil).some((o) => o.kod === 'vade_gecmis'));
  assert.equal((await admin.del('/api/tedarikciler/' + t.id)).status, 409);

  const rapor = (await admin.get('/api/raporlar/tedarikci-alim')).data;
  assert.ok(rapor.some((r) => r.tedarikci === 'Vadeli Depo' && r.tutar === 100));
});
