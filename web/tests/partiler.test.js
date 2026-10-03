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

async function partiToplami(ilacId) {
  const partiler = (await admin.get(`/api/ilaclar/${ilacId}/partiler`)).data;
  return partiler.reduce((t, p) => t + p.miktar, 0);
}

test('mevcut stok baslangicta acilis partisine donusturulur', async () => {
  const ilac = (await admin.get('/api/ilaclar/1')).data;
  assert.equal(await partiToplami(1), ilac.stok);
  assert.equal(ilac.en_yakin_skt, ilac.skt);
});

test('satis SKT si en yakin partiden duser (FEFO)', async () => {
  const yeni = await admin.post('/api/ilaclar', { ad: 'FEFO Test', satis_fiyati: 10, skt: '2031-01-01' });
  const id = yeni.data.id;
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 5, parti_no: 'GEC', skt: '2030-06-01' });
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 3, parti_no: 'ERKEN', skt: '2029-01-01' });

  const ilac = (await admin.get(`/api/ilaclar/${id}`)).data;
  assert.equal(ilac.stok, 8);
  assert.equal(ilac.en_yakin_skt, '2029-01-01');

  const satis = await admin.post('/api/satislar', { kalemler: [{ ilac_id: id, adet: 4 }] });
  assert.equal(satis.status, 201);

  const partiler = (await admin.get(`/api/ilaclar/${id}/partiler?tumu=1`)).data;
  const erken = partiler.find((p) => p.parti_no === 'ERKEN');
  const gec = partiler.find((p) => p.parti_no === 'GEC');
  assert.equal(erken.miktar, 0, 'once erken SKT li parti bitmeli');
  assert.equal(gec.miktar, 4);
  assert.equal((await admin.get(`/api/ilaclar/${id}`)).data.en_yakin_skt, '2030-06-01');
});

test('ayni parti numarasi ve SKT ile giris mevcut partiye eklenir', async () => {
  const yeni = await admin.post('/api/ilaclar', { ad: 'Parti Birlesme', satis_fiyati: 10 });
  const id = yeni.data.id;
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 2, parti_no: 'L1', skt: '2030-01-01' });
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 3, parti_no: 'L1', skt: '2030-01-01' });
  const partiler = (await admin.get(`/api/ilaclar/${id}/partiler`)).data;
  assert.equal(partiler.length, 1);
  assert.equal(partiler[0].miktar, 5);
  assert.equal(partiler[0].giris_miktari, 5);
});

test('belirli partiden cikis (imha) yapilabilir ve fazlasi reddedilir', async () => {
  const yeni = await admin.post('/api/ilaclar', { ad: 'Imha Test', satis_fiyati: 10 });
  const id = yeni.data.id;
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 4, parti_no: 'ESKI', skt: '2020-01-01' });
  await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'giris', adet: 6, parti_no: 'YENI', skt: '2032-01-01' });
  const partiler = (await admin.get(`/api/ilaclar/${id}/partiler`)).data;
  const yeniParti = partiler.find((p) => p.parti_no === 'YENI');

  const fazla = await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'cikis', adet: 7, parti_id: yeniParti.id });
  assert.equal(fazla.status, 400);

  const imha = await admin.post(`/api/ilaclar/${id}/stok`, { tip: 'cikis', adet: 2, parti_id: yeniParti.id });
  assert.equal(imha.status, 200);
  assert.equal(imha.data.stok, 8);
  const sonra = (await admin.get(`/api/ilaclar/${id}/partiler`)).data;
  assert.equal(sonra.find((p) => p.parti_no === 'YENI').miktar, 4);
  assert.equal(sonra.find((p) => p.parti_no === 'ESKI').miktar, 4, 'diger parti etkilenmemeli');

  const uyarilar = (await admin.get('/api/ilaclar/uyarilar')).data;
  const eskiUyari = uyarilar.skt_yaklasan.find((u) => u.id === id);
  assert.ok(eskiUyari, 'SKT si gecmis parti uyarilarda olmali');
  assert.equal(eskiUyari.parti_no, 'ESKI');
  assert.equal(eskiUyari.durum, 'sona_ermis');
  assert.equal(eskiUyari.stok, 4);
});

test('siparis teslim alinirken girilen parti bilgisi kaydedilir', async () => {
  const yeni = await admin.post('/api/ilaclar', { ad: 'Siparis Parti', satis_fiyati: 10 });
  const id = yeni.data.id;
  const siparis = await admin.post('/api/siparisler', { tedarikci_id: 1, kalemler: [{ ilac_id: id, istenen_adet: 12 }] });
  const detay = (await admin.get(`/api/siparisler/${siparis.data.id}`)).data;
  const kalemId = detay.kalemler[0].id;

  const teslim = await admin.put(`/api/siparisler/${siparis.data.id}/durum`, {
    durum: 'teslim_alindi',
    partiler: { [kalemId]: { parti_no: 'SP-77', skt: '2030-03-03' } }
  });
  assert.equal(teslim.status, 200);
  const partiler = (await admin.get(`/api/ilaclar/${id}/partiler`)).data;
  assert.equal(partiler.length, 1);
  assert.equal(partiler[0].parti_no, 'SP-77');
  assert.equal(partiler[0].skt, '2030-03-03');
  assert.equal(partiler[0].miktar, 12);
});

test('parti SKT raporu suresi yaklasan lotlari listeler', async () => {
  const rapor = (await admin.get('/api/raporlar/parti-skt')).data;
  const eski = rapor.find((r) => r.parti_no === 'ESKI');
  assert.ok(eski);
  assert.ok(eski.kalan_gun < 0);
  assert.ok(!rapor.some((r) => r.parti_no === 'YENI'), '180 gunden uzak parti listelenmemeli');
});

test('yedekten geri yukleme sonrasi partiler stokla esit kalir', async () => {
  const yedek = (await admin.get('/api/yedekleme/export')).data;
  // Partisiz eski bir yedek gibi davran
  delete yedek.tablolar.ilac_partileri;
  delete yedek.tablolar.satis_kalemi_partileri;
  const geri = await admin.post('/api/yedekleme/import', yedek);
  assert.equal(geri.status, 200);
  const ilaclar = (await admin.get('/api/ilaclar')).data;
  for (const ilac of ilaclar.slice(0, 5)) {
    assert.equal(await partiToplami(ilac.id), ilac.stok, `${ilac.ad} parti toplami stokla esit olmali`);
  }
});
