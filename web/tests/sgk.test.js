const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { xlsxYap, zipYap } = require('./xlsxYap');
const { docYap } = require('./docYap');
const { wordMetni } = require('../server/wordOku');
const S = require('../server/sgk');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
});

// Gercek EK-4/D'nin sadelestirilmis kopyasi: \r paragraf, \x07 tablo hucresi/satiri
const EK4D = [
  'HASTA KATILIM PAYINDAN MUAF İLAÇLAR LİSTESİ (EK-4/D)',
  '4. Uzun süreli kalp ve damar hastalıkları',
  '4.5. \tArteriyel hipertansiyon (I10 -I13)   (I15)',
  'I10\x07Esansiyel (primer) hipertansiyon\x07\x07I11.9\x07Hipertansif kalp hastalığı\x07\x07',
  '\t4.5.1. \tBeta adrenerjik reseptör blokerleri',
  '(Değişik: RG-01/01/2024-1/2 md. Yürürlük: 01/01/2024)',
  '\t4.5.2. \tAnjiotensin dönüştürücü enzim inhibitörleri ve kombinasyonları',
  '\t4.5.3. \tAsetil salisilik asit* (Sadece I11 kodunda)',
  '8. Kan hastalıkları',
  '8.1. \tHastalıklar',
  '8.1.2 \tHemolitik anemiler',
  '8.1.2.1 Talasemiler (D56)',
  'D56\x07Talasemi\x07\x07',
  '8.2. \tYalnızca bu hastalıkların tedavisine yönelik kullanılan ilaçlar',
  '\t8.2.1. \tŞelatörler*',
  '\t8.2.2. \tFolik asit',
  '',
  '\tNOT:',
  '1- Bu liste etken maddelere göre düzenlenmiştir.'
].join('\r');

const EK4F = [
  'EK-4/F',
  'AYAKTA TEDAVİDE SAĞLIK RAPORU (Uzman Hekim Raporu/Sağlık Kurulu Raporu) İLE VERİLEBİLECEK İLAÇLAR LİSTESİ',
  '   İmmünsupresifler (Topikal formları dahil) ',
  '   Betanekol',
  '   Danazol',
  '   Desmopressin (Prospektüs endikasyonlarından yalnızca primer enurezis nokturna tedavisinde ödenir.)',
  '   a) Primer enurezis nokturna tedavisinde uzman hekimlerce raporsuz reçete edilmesi halinde,',
  '   Metoprolol ve diğer beta blokerler (kalp yetmezliğinde kardiyoloji raporu ile)',
  '   Edrofonyum'
].join('\r');

test('EK-4/D ayrıştırma: ICD kodları, ilaç maddeleri, ortak liste ve alt başlıklar', () => {
  const gruplar = S.ek4dCoz(EK4D);
  assert.equal(gruplar.length, 2);
  const ht = gruplar[0];
  assert.equal(ht.kod, '4.5');
  assert.equal(ht.ana, 'Uzun süreli kalp ve damar hastalıkları');
  assert.deepEqual(ht.icd.map((x) => x.kod), ['I10', 'I11.9']);
  assert.deepEqual(ht.ilaclar.map((m) => m.ad), ['Beta adrenerjik reseptör blokerleri', 'Anjiotensin dönüştürücü enzim inhibitörleri ve kombinasyonları', 'Asetil salisilik asit']);
  assert.equal(ht.ilaclar[2].endikasyon, true, '(*) endikasyon uyumu');
  assert.equal(ht.ilaclar[2].kosul, '(Sadece I11 kodunda)');
  // "8.1.2 Hemolitik anemiler" kategori basligidir, ilac sayilmaz; ilaclar 8.2 ortak listesinden gelir
  const tal = gruplar[1];
  assert.equal(tal.kod, '8.1.2.1');
  assert.deepEqual(tal.ilaclar.map((m) => m.ad), ['Şelatörler', 'Folik asit']);
  assert.match(tal.ortak_not, /Yalnızca bu hastalıkların/);

  // NOT 3: ana kod yazilmissa alt kodlar dahil; basliktaki aralik da kapsar
  assert.ok(S.icdKapsar(ht, 'I10'));
  assert.ok(S.icdKapsar(ht, 'i12.0'), 'I10-I13 araligi');
  assert.ok(S.icdKapsar(ht, 'I15.8'));
  assert.ok(!S.icdKapsar(ht, 'I20'));
  assert.ok(S.icdKapsar(tal, 'D56.1'));
  assert.ok(!S.icdKapsar(tal, 'D57'));
});

test('eşleştirme: Türkçe/Latince yazım ve ATC sınıfı', () => {
  assert.equal(S.fonetik('Digoxin'), S.fonetik('Digoksin'));
  assert.equal(S.fonetik('Methotrexat'), S.fonetik('Metotreksat'));
  const a = { anahtarlar: S.etkenAnahtarlari('Asetilsalisilik asit 100 mg'), atc: 'B01AC06' };
  assert.equal(S.maddeEslesir('Asetil salisilik asit', a), 'etken');
  assert.equal(S.maddeEslesir('Antiagreganlar', a), 'sinif');
  assert.equal(S.maddeEslesir('Beta blokerler ve kombinasyonları', a), null);
  assert.equal(S.maddeEslesir('Beta blokerler ve kombinasyonları', { anahtarlar: ['metoprolol'], atc: 'C07AB02' }), 'sinif');
  assert.equal(S.excelTarih('42850'), '2017-04-25');
  assert.equal(S.excelTarih('05.03.2026'), '2026-03-05');
});

test('Word .doc okuyucu: sıkıştırılmış ve Unicode parçalar, alan kodları', () => {
  const doc = docYap([
    { metin: 'EK-4/D\rBaslik ', sikistirilmis: true },
    { metin: 'İlaç \x13 HYPERLINK "x" \x14bağlantı\x15 şğü\r' }
  ]);
  assert.equal(wordMetni(doc), 'EK-4/D\rBaslik İlaç bağlantı şğü\r');
  assert.throws(() => wordMetni(Buffer.from('düz metin dosyası, word değil.......')), /Word/);
});

function ek4aXlsx(satirlar) {
  return xlsxYap([
    {
      ad: 'EK-4A',
      satirlar: [
        ['BEDELİ ÖDENECEK İLAÇLAR LİSTESİ (EK-4/A)'],
        ['Kamu No', 'Güncel Barkod', 'İlaç Adı', 'Eski Barkodlar', 'Eşdeğer İlaç Grubu', 'Terapötik Referans Grubu', 'Listeye Giriş Tarihi', 'Aktiflenme Tarihi', 'Pasiflenme Tarihi',
          'Uygulanan İndirim Oranlarına Esas Durumu', 'Depocuya Satış  Fiyatı (Firma Satış Fiyatı) 151,25 TL ve üzeri ise', 'Depocuya Satış  Fiyatı (Firma Satış Fiyatı) 100,38 TL (dahil) - 151,24 TL (dahil) arasında ise',
          'Depocuya Satış  Fiyatı (Firma Satış Fiyatı) 52,44 TL (dahil) - 100,37 TL (dahil) arasında ise', 'Depocuya Satış  Fiyatı (Firma Satış Fiyatı) 52,43 TL ve altında ise', 'Özel İskonto', 'Eczacı İskonto Oranı'],
        ...satirlar
      ]
    }
  ]);
}

test('SUT paketi yükleme, ICD arama ve ilaç kartı SUT özeti', async () => {
  const admin = await girisliIstemci(sunucu.base, 'admin');
  const kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  const yukle = (c, tampon, ad) =>
    fetch(`${sunucu.base}/api/sgk/yukle?ad=${encodeURIComponent(ad)}`, { method: 'POST', headers: { Cookie: c.cerez(), 'Content-Type': 'application/octet-stream' }, body: tampon });

  const xlsx = ek4aXlsx([
    ['A01', '8690000000017', 'METOTEST 50 MG 28 TABLET', '8690000000999', 'E100A', '', '42850', '', '', 'JENERİK', '0.4', '0.28', '0.1', '0', '', '0-2,5%'],
    ['A02', '8690000000024', 'METOREF 50 MG 28 TABLET', '', 'E100A', '', '', '', '45000', 'REFERANS', '0.41', '0.31', '0.1', '0', '', '0-2,5%']
  ]);
  const ek4e = zipYap({
    'word/document.xml': `<w:document><w:body>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>1-BETALAKTAM ANTİBİYOTİKLER</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Amoksisilin</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>KY</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:t>AÇIKLAMALAR:</w:t></w:r></w:p><w:p><w:r><w:t>1.KY: Kısıtlama olmayan antibiyotikler.</w:t></w:r></w:p>
    </w:body></w:document>`
  });
  const paket = zipYap({
    '2026.10.02-Güncel 2013 SUT/EK-4 LİSTELERİ/EK-4A BEDELİ ÖDENECEK İLAÇLAR LİSTESİ.xlsx': xlsx,
    '2026.10.02-Güncel 2013 SUT/EK-4 LİSTELERİ/EK-4D HASTA KATILIM PAYINDAN MUAF İLAÇLAR LİSTESİ.doc': docYap([{ metin: EK4D }]),
    '2026.10.02-Güncel 2013 SUT/EK-4 LİSTELERİ/EK-4E REÇETELEME KURALLARI.docx': ek4e,
    '2026.10.02-Güncel 2013 SUT/EK-4 LİSTELERİ/EK-4F SAĞ.RAP İLE VER. İLAÇLAR.doc': docYap([{ metin: EK4F }]),
    '2026.10.02-Güncel 2013 SUT/EK-4 LİSTELERİ/MÜLGA EK-4 LİSTELERİ/MÜLGA EK-4A ESKİ.xlsx': ek4aXlsx([['X', '8690000000031', 'ESKI', '', '', '', '', '', '', '', '', '', '', '', '', '']])
  });

  // Katalogda SUT'tan once olan urun: yuklemede "SGK kapsaminda" isaretlenir
  const urun = (await admin.post('/api/ilaclar', { ad: 'Metotest 50mg 28 Tablet', barkod: '8690000000017', satis_fiyati: 60, etken_madde: 'metoprolol', stok: 5 })).data;
  const atc = await admin.put(`/api/ilac-bilgi/${urun.id}`, { depocu_fiyati: 120.5, atc_kodu: 'C07AB02' });
  assert.equal(atc.status, 200, JSON.stringify(atc.data));

  assert.equal((await yukle(kasiyer, paket, 'sut.zip')).status, 403, 'kasiyer yükleyemez');
  const r = await yukle(admin, paket, 'sut.zip');
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.deepEqual(d.yuklenen, ['ek4a', 'ek4d', 'ek4e', 'ek4f']);
  assert.equal(d.ek4a, 2, 'MÜLGA klasörü alınmaz');
  assert.equal(d.ek4d_grup, 2);
  assert.equal(d.ek4e, 1);
  assert.ok(d.ek4f >= 5);
  assert.equal(d.liste_tarihi, '2026-10-02');
  assert.equal(d.sgk_isaretlenen, 1);

  // Tani koduyla arama: alt kod ana kodu kapsar, katalogdaki uygun urun ATC sinifiyla bulunur
  const ara = (await admin.get('/api/sgk/icd?q=I11.9')).data;
  assert.equal(ara.gruplar.length, 1);
  assert.equal(ara.gruplar[0].kod, '4.5');
  assert.deepEqual(ara.gruplar[0].icd_eslesen.map((x) => x.kod), ['I11.9']);
  const uygun = ara.gruplar[0].katalog.find((k) => k.id === urun.id);
  assert.equal(uygun.madde, 'Beta adrenerjik reseptör blokerleri');
  assert.equal((await admin.get('/api/sgk/icd?q=talasemi')).data.gruplar[0].kod, '8.1.2.1');
  assert.equal((await admin.get('/api/sgk/icd?q=K21.0')).data.gruplar.length, 0);

  // Ilac karti ozeti
  const oz = (await kasiyer.get(`/api/sgk/ilac/${urun.id}`)).data;
  assert.equal(oz.ek4a.kamu_no, 'A01');
  assert.equal(oz.ek4a.aktif, true);
  assert.equal(oz.ek4a.giris_tarihi, '2017-04-25');
  assert.equal(oz.iskonto.secili, 1, 'DSF 120,50 TL → 100,38-151,24 bandı');
  assert.equal(oz.iskonto.oran, 28);
  assert.deepEqual(oz.esdegerler.map((e) => e.barkod), ['8690000000024']);
  assert.ok(oz.esdegerler[0].pasif_tarihi, 'pasif eşdeğer işaretli');
  assert.equal(oz.muafiyet.length, 1);
  assert.equal(oz.muafiyet[0].madde.eslesme, 'sinif');
  assert.equal(oz.ek4f.length, 1, 'yalnızca madde başlığı eşleşir');
  assert.match(oz.ek4f[0].metin, /Metoprolol/);
  const kart = (await admin.get(`/api/ilac-bilgi/${urun.id}`)).data;
  assert.equal(kart.bilgi.sgk_kapsaminda, 1);

  // Eski barkodla da bulunur; tek dosya (yalniz EK-4E) diger listeleri silmez
  const eski = (await admin.post('/api/ilaclar', { ad: 'Amoksisilin Test', barkod: '8690000000999', satis_fiyati: 10, etken_madde: 'amoksisilin' })).data;
  const oz2 = (await admin.get(`/api/sgk/ilac/${eski.id}`)).data;
  assert.equal(oz2.ek4a.barkod, '8690000000017');
  assert.equal(oz2.ek4e[0].metin, 'KY');
  assert.match(oz2.ek4e_aciklama, /Kısıtlama olmayan/);
  const tek = await (await yukle(admin, ek4e, 'EK-4E.docx')).json();
  assert.deepEqual(tek.yuklenen, ['ek4e']);
  assert.equal(tek.ek4a, 2);

  // Bozuk dosya anlasilir hata verir
  const bozuk = await yukle(admin, Buffer.from('merhaba dunya bu bir sut dosyasi degil'), 'x.txt');
  assert.equal(bozuk.status, 400);
  assert.match((await bozuk.json()).error, /Dosya türü tanınmadı/);
});

test('SGK indirme: duyurudan zip bulunur, başka alan adına yönlendirme reddedilir', async () => {
  const { sonSutIndir } = require('../server/routes/sgk');
  const yanit = (govde, durum = 200, konum) => ({
    ok: durum < 300, status: durum, headers: { get: (h) => (h === 'location' ? konum : null) },
    text: async () => govde, arrayBuffer: async () => Buffer.from(govde)
  });
  const istenen = [];
  const sahte = async (url) => {
    istenen.push(url.href);
    if (url.pathname === '/') return yanit('<a href="/duyuru/detay/Guncel-2013-SUT-2026">SUT</a>');
    if (url.pathname.startsWith('/duyuru/')) return yanit('<a href="/Download/DownloadFile?f=abc.zip&amp;d=1">indir</a>');
    if (url.pathname === '/Download/DownloadFile') return yanit('ZIPVERI');
    return yanit('', 404);
  };
  assert.equal((await sonSutIndir(sahte)).toString(), 'ZIPVERI');
  assert.equal(istenen[2], 'https://www.sgk.gov.tr/Download/DownloadFile?f=abc.zip&d=1');

  const kotu = async (url) => (url.pathname === '/' ? yanit('', 302, 'https://kotu.example.com/') : yanit(''));
  await assert.rejects(() => sonSutIndir(kotu), /Yalnızca sgk\.gov\.tr/);
});
