const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { xlsxYap } = require('./xlsxYap');
const { xlsxOku } = require('../server/xlsxOku');
const { listeyiCoz, sonListeyiIndir } = require('../server/titck');
const { hastaMaliyeti, sayiOku, urlOku } = require('../server/ilacBilgi');

let sunucu;
let admin;
let kasiyer;
let parolId;
let nurofenId;

const BASLIK = ['İlaç Adı', 'Barkod', 'ATC Kodu', 'ATC Adı', 'Firma Adı', 'Reçete\r\nTürü', 'Durumu', 'Açıklama', 'Temel İlaç Listesi Durumu'];
const TITCK = xlsxYap([
  {
    ad: 'AKTİF ÜRÜNLER LİSTESİ',
    satirlar: [
      ['', 'SKRS E-REÇETE İLAÇ VE DİĞER FARMASÖTİK ÜRÜNLER LİSTESİ'],
      ['AKTİF ÜRÜNLER LİSTESİ (22.09.2026-28.09.2026 arası değişiklikler işlenmiştir.)'],
      BASLIK,
      ['PAROL 500 MG 20 TABLET', '8699504010012', 'N02BE01', 'paracetamol', 'ATABAY KİMYA A.Ş.', 'Normal', 'Aktif', '', '1'],
      ['TERMOL 500 MG\r\n20 TABLET', '8690000000011', 'N02BE01', 'paracetamol', 'FİRMA B A.Ş.', 'Normal', 'Aktif', '', '0'],
      ['XANAX 0.5 MG 30 TABLET', '8699504010081', 'N05BA12', 'alprazolam', 'FİRMA C', 'Yeşil', 'Aktif', '', '0'],
      ['BOZUK SATIR', 'abc', 'N02', 'x', 'y', 'Normal', 'Aktif']
    ]
  },
  {
    ad: 'PASİF ÜRÜNLER LİSTESİ',
    satirlar: [['PASİF ÜRÜNLER LİSTESİ'], BASLIK, ['NUROFEN 400 MG 24 TABLET', '8699504010043', 'M01AE01', 'ibuprofen', 'FİRMA D', 'Normal', 'Pasif', '']]
  },
  { ad: 'LİSTEYE YENİ EKLENEN ÜRÜNLER', satirlar: [BASLIK, ['YOK SAYILIR', '8699999999999', 'A01', 'z', 'q', 'Normal', 'Aktif']] }
]);

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  parolId = (await admin.get('/api/ilaclar?q=8699504010012')).data[0].id;
  nurofenId = (await admin.get('/api/ilaclar?q=8699504010043')).data[0].id;
});
after(() => sunucu.kapat());

const yukle = (govde, istemci = admin) =>
  fetch(sunucu.base + '/api/titck/yukle', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Cookie: istemci.cerez() }, body: govde });

test('xlsx okuyucu: sayfalar, paylaşılan metinler, boş hücreler', () => {
  const s = xlsxOku(xlsxYap([{ ad: 'A&B', satirlar: [['x', '', 'z'], ['1', '2']] }]));
  assert.equal(s[0].ad, 'A&B');
  assert.deepEqual(s[0].satirlar, [['x', '', 'z'], ['1', '2']]);
  assert.throws(() => xlsxOku(Buffer.from('bu bir zip değil')), /zip/);
});

test('TİTCK listesi ayrıştırılır: aktif/pasif, reçete türü, geçersiz barkod ve yan sayfalar atlanır', () => {
  const c = listeyiCoz(TITCK);
  assert.equal(c.liste_tarihi, '2026-09-28');
  assert.equal(c.kayitlar.length, 4);
  const termol = c.kayitlar.find((k) => k.barkod === '8690000000011');
  assert.equal(termol.ad, 'TERMOL 500 MG 20 TABLET', 'satır sonları temizlenir');
  assert.equal(c.kayitlar.find((k) => k.barkod === '8699504010081').recete_turu, 'yesil');
  assert.equal(c.kayitlar.find((k) => k.barkod === '8699504010043').durum, 'pasif');
  assert.ok(!c.kayitlar.some((k) => k.barkod === '8699999999999'));
  assert.ok(listeyiCoz(xlsxYap([{ ad: 'Sayfa1', satirlar: [['a']] }])).hata);
});

test('indirici yalnızca titck.gov.tr alan adını kabul eder', async () => {
  await assert.rejects(() => sonListeyiIndir(async () => ({ ok: true, text: async () => '<a href="https://baska.com/AKLST.xlsx">x</a>', arrayBuffer: async () => new ArrayBuffer(1) })), /titck\.gov\.tr/);
});

test('yükleme yetkisi: kasiyer yükleyemez, bozuk dosya reddedilir', async () => {
  assert.equal((await yukle(TITCK, kasiyer)).status, 403);
  assert.equal((await yukle(Buffer.from('bozuk'))).status, 400);
  assert.equal((await yukle(Buffer.alloc(0))).status, 400);
});

test('liste yüklenir; katalogdaki ürünlerin boş ATC kodu doldurulur', async () => {
  const yanit = await yukle(TITCK);
  assert.equal(yanit.status, 200);
  const d = await yanit.json();
  assert.equal(d.toplam, 4);
  assert.equal(d.pasif, 1);
  assert.equal(d.atc_doldurulan, 3); // Parol, Nurofen ve Xanax demo katalogda var
  assert.equal((await admin.get('/api/titck/durum')).data.liste_tarihi, '2026-09-28');
  const kart = (await admin.get(`/api/ilac-bilgi/${parolId}`)).data;
  assert.equal(kart.atc_kodu, 'N02BE01');
  assert.equal(kart.titck.durum, 'aktif');
  assert.equal(kart.titck.atc_grubu, 'Sinir sistemi');
});

test('TİTCK arama: ad, barkod ve ATC ile; katalogda olup olmadığı işaretlenir', async () => {
  assert.equal((await admin.get('/api/titck/ara?q=a')).status, 400);
  const ad = (await admin.get('/api/titck/ara?q=termol')).data;
  assert.equal(ad.length, 1);
  assert.equal(ad[0].katalogda, false);
  const atc = (await admin.get('/api/titck/ara?q=N02BE')).data;
  assert.equal(atc.length, 2);
  assert.equal(atc.find((r) => r.barkod === '8699504010012').katalogda, true);
  assert.equal((await admin.get('/api/titck/barkod/8699504010081')).data.recete_turu, 'yesil');
  assert.equal((await admin.get('/api/titck/barkod/1111111111111')).status, 404);
});

test('listeden ürün ekleme: ad, firma, ATC grubu ve reçete türü dolar; tekrar eklenemez', async () => {
  assert.equal((await kasiyer.post('/api/titck/urune-ekle', { barkod: '8699504010081', satis_fiyati: 50 })).status, 403);
  assert.equal((await admin.post('/api/titck/urune-ekle', { barkod: '8690000000011' })).status, 400, 'fiyat zorunlu');
  assert.equal((await admin.post('/api/titck/urune-ekle', { barkod: '8699504010012', satis_fiyati: 5 })).status, 409);
  const e = await admin.post('/api/titck/urune-ekle', { barkod: '8690000000011', satis_fiyati: 31.5 });
  assert.equal(e.status, 201);
  const ilac = (await admin.get(`/api/ilaclar/${e.data.id}`)).data;
  assert.equal(ilac.ad, 'TERMOL 500 MG 20 TABLET');
  assert.equal(ilac.uretici, 'FİRMA B A.Ş.');
  assert.equal(ilac.kategori, 'Sinir sistemi');
  assert.equal((await admin.get('/api/ilac-bilgi/' + e.data.id)).data.atc_kodu, 'N02BE01');
});

test('eşdeğerler ATC koduna göre; katalogda olmayan TİTCK eşdeğerleri ayrı listelenir', async () => {
  await admin.post(`/api/ilaclar/${parolId}/stok`, { tip: 'giris', adet: 5, parti_no: 'X', skt: '2030-01-01' });
  const kart = (await admin.get(`/api/ilac-bilgi/${parolId}`)).data;
  assert.equal(kart.esdeger_kaynagi, 'ATC N02BE01');
  assert.ok(kart.esdegerler.some((e) => e.ad === 'TERMOL 500 MG 20 TABLET'));
  assert.ok(!kart.esdegerler.some((e) => e.id === parolId));
  assert.deepEqual(kart.titck_esdegerler, []);
});

test('pasif ürün stok uyarısı', async () => {
  await admin.post(`/api/ilaclar/${nurofenId}/stok`, { tip: 'giris', adet: 3, parti_no: 'N1', skt: '2030-01-01' });
  const l = (await admin.get('/api/titck/pasif-stok')).data;
  assert.equal(l.length, 1);
  assert.equal(l[0].durum, 'pasif');
});

test('ilaç kartı kaydı: doğrulama, fiyat hareketi ve yetki', async () => {
  const url = `/api/ilac-bilgi/${parolId}`;
  assert.equal((await kasiyer.put(url, { endikasyon: 'x' })).status, 403);
  assert.equal((await admin.put(url, { kub_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await admin.put(url, { tablet_renk: ['mor', 'mavi', 'sarı'] })).status, 400);
  assert.equal((await admin.put(url, { tablet_renk: 'turkuaz' })).status, 400);
  assert.equal((await admin.put(url, { atc_kodu: 'xyz' })).status, 400);
  assert.equal((await admin.put(url, { kamu_fiyati: 'abc' })).status, 400);
  const ok = await admin.put(url, {
    tablet_renk: ['Beyaz'], tablet_sekil: 'yuvarlak', tablet_yazi: 'PAROL 500', tablet_centik: 'tek', endikasyon: 'Ağrı ve ateş',
    kamu_fiyati: '20,50', kamu_odenecek: 20.5, depocu_fiyati: 18, kub_url: 'https://example.com/kub.pdf', sut_notu: 'Not'
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.tablet_renk, 'beyaz');
  assert.equal(ok.data.kamu_fiyati, 20.5);
  const kart = (await admin.get(url)).data;
  assert.ok(kart.hareketler.some((h) => h.kf === 20.5 && h.kaynak === 'elle giriş'));
  // ayni deger tekrar kaydedilince yeni hareket olusmaz
  await admin.put(url, { kamu_fiyati: 20.5 });
  assert.equal((await admin.get(url)).data.hareketler.filter((h) => h.kf === 20.5).length, 1);
});

test('hasta maliyeti: fiyat farkı + katılım payı', async () => {
  assert.deepEqual(
    hastaMaliyeti({ psf: 100, kamuFiyati: 80, kamuOdenecek: 80, adet: 2, hasta: 'aktif' }),
    { hasta: 'aktif', hasta_adi: 'Aktif çalışan / bakmakla yükümlü', oran: 0.2, adet: 2, psf: 200, fiyat_farki: 40, katilim_payi: 32, hasta_oder: 72, sgk_oder: 128 }
  );
  assert.equal(hastaMaliyeti({ psf: 100, kamuFiyati: null }), null);
  assert.equal(hastaMaliyeti({ psf: 50, kamuFiyati: 80, kamuOdenecek: 80, hasta: 'muaf' }).hasta_oder, 0);
  const url = `/api/ilac-bilgi/${parolId}/hasta-maliyet`;
  const r = (await admin.get(url + '?hasta=emekli&adet=2')).data;
  assert.equal(r.oran, 0.1);
  assert.equal(r.adet, 2);
  assert.equal((await admin.get(url + '?hasta=yok')).status, 400);
  assert.equal((await admin.get(url + '?adet=0')).status, 400);
  assert.equal((await admin.get(`/api/ilac-bilgi/${nurofenId}/hasta-maliyet`)).status, 409, 'kamu fiyatı yoksa hesaplanamaz');
});

test('ilaç tespit: özelliklerin hepsi eşleşmeli; en az bir özellik gerekir', async () => {
  assert.equal((await admin.get('/api/ilac-bilgi/tespit')).status, 400);
  assert.equal((await admin.get('/api/ilac-bilgi/tespit?renk=turkuaz')).status, 400);
  const hepsi = (await admin.get('/api/ilac-bilgi/tespit?renk=beyaz&sekil=yuvarlak&yazi=parol&yazi=500&centik=tek')).data;
  assert.equal(hepsi.toplam, 1);
  assert.equal(hepsi.sonuclar[0].id, parolId);
  assert.equal((await admin.get('/api/ilac-bilgi/tespit?renk=beyaz&sekil=oval')).data.toplam, 0);
  assert.equal((await admin.get('/api/ilac-bilgi/tespit?atc=n02')).data.toplam, 2, 'ATC öneki; TİTCK ile eşleşen katalog ürünleri');
  assert.equal((await admin.get('/api/ilac-bilgi/tespit?endikasyon=ateş')).data.toplam, 1);
});

test('CSV içe aktarma: önizleme, hata satırı, bulunamayan barkod ve uygulama', async () => {
  const csv = `barkod;renk;sekil;yazi;KF;KÖ;PSF\n8699504010043;mavi;oval;IBU 400;40,00;40,00;55,00\n0000000000000;beyaz;;;;;\n8699504010043;kirmizi-mor;;;;;`;
  const on = (await admin.post('/api/ilac-bilgi/ice-aktar', { csv, onizleme: true })).data;
  assert.equal(on.ozet.guncellenecek, 1);
  assert.equal(on.ozet.bulunamadi, 1);
  assert.equal(on.ozet.hata, 1);
  assert.equal((await admin.post('/api/ilac-bilgi/ice-aktar', { csv })).status, 400, 'hata varken uygulanmaz');
  const temiz = `barkod;renk;sekil;yazi;KF;KÖ;PSF\n8699504010043;mavi;oval;IBU 400;40,00;40,00;55,00`;
  assert.equal((await admin.post('/api/ilac-bilgi/ice-aktar', { csv: temiz })).status, 200);
  const kart = (await admin.get(`/api/ilac-bilgi/${nurofenId}`)).data;
  assert.equal(kart.bilgi.tablet_sekil, 'oval');
  assert.equal(kart.bilgi.kamu_fiyati, 40);
  assert.ok(kart.hareketler.some((h) => h.psf === 55 && h.kf === 40));
  assert.equal((await kasiyer.post('/api/ilac-bilgi/ice-aktar', { csv: temiz })).status, 403);
  assert.equal((await admin.post('/api/ilac-bilgi/ice-aktar', { csv: 'ad;fiyat\nx;1' })).status, 400);
});

test('kategori gezgini: süzgeçler, sayımlar ve sıralama', async () => {
  const g = (await admin.get('/api/ilac-bilgi/gezgin')).data;
  assert.ok(g.toplam > 5);
  assert.ok(g.kategoriler.length && g.markalar.length && g.tipler.length);
  const ucuz = (await admin.get('/api/ilac-bilgi/gezgin?sirala=fiyat_artan&limit=3')).data;
  assert.equal(ucuz.urunler.length, 3);
  assert.ok(ucuz.urunler[0].satis_fiyati <= ucuz.urunler[1].satis_fiyati);
  const kat = g.kategoriler[0].ad;
  const sec = (await admin.get('/api/ilac-bilgi/gezgin?kategori=' + encodeURIComponent(kat))).data;
  assert.ok(sec.urunler.every((u) => u.kategori === kat));
  assert.equal(sec.kategoriler.length, g.kategoriler.length, 'seçili kategori diğer kategorilerin sayısını yok etmez');
  assert.ok((await admin.get('/api/ilac-bilgi/gezgin?stokta=1')).data.urunler.every((u) => u.stok > 0));
});

test('yardımcılar: sayı ve bağlantı doğrulama', () => {
  assert.equal(sayiOku('1.234,56'), 1234.56);
  assert.equal(sayiOku('12.5'), 12.5);
  assert.equal(sayiOku(''), null);
  assert.ok(Number.isNaN(sayiOku('abc')));
  assert.ok(Number.isNaN(sayiOku('-5')));
  assert.equal(urlOku('https://a.b/c'), 'https://a.b/c');
  assert.ok(Number.isNaN(urlOku('ftp://a.b')));
});
