const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const R = require('../server/receteOku');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
});

const ORNEK = [
  'T.C. SAĞLIK BAKANLIĞI',
  'e-Reçete No: 2a5b7cd',
  'Hasta: AHMET YILMAZ   TC: 12345678901',
  'Tanı: I10 Esansiyel hipertansiyon, J06.9',
  '1) PAR0L 500 MG 20 TABLET   Doz: 3x1   2 Kutu',
  '2) BELOC ZOK 50 MG 28 TB 1x1',
  '3) Bilinmeyen İlaç 10 mg',
  'Dr. Ayşe Kaya  Dip. No 12345'
].join('\n');

test('reçete metni: numara, tanılar, adet, kullanım ve OCR hatalarına tolerans', () => {
  const urunler = [
    { id: 1, ad: 'Parol 500mg 20 Tablet', kaynak: 'katalog', stok: 5 },
    { id: 2, ad: 'Parol 500mg 30 Tablet', kaynak: 'katalog', stok: 0 },
    { id: 3, ad: 'Beloc Zok 50mg 28 Tablet', kaynak: 'katalog', stok: 2 },
    { id: null, barkod: '8690000000017', ad: 'BELOC ZOK 100 MG 30 TABLET', kaynak: 'titck' }
  ];
  const r = R.receteyiCoz(ORNEK, urunler);
  assert.equal(r.recete_no, '2A5B7CD');
  assert.deepEqual(r.tanilar, ['I10', 'J06.9']);
  assert.equal(r.kalemler.length, 2, 'başlık satırları ve tanınmayan ilaç atlanır');
  const [parol, beloc] = r.kalemler;
  assert.equal(parol.adaylar[0].id, 1, '"PAR0L" → Parol; doz ve kutu adedi eşleşen önce');
  assert.equal(parol.adet, 2);
  assert.equal(parol.kullanim, '3x1');
  assert.equal(beloc.adaylar[0].id, 3, 'katalogdaki doz önce');
  assert.equal(beloc.adaylar[1].kaynak, 'titck');
  assert.equal(beloc.kullanim, '1x1');
  assert.equal(beloc.adet, 1);

  // Tek harf OCR hatasi (I/l) marka eslesmesini bozmaz
  assert.equal(R.receteyiCoz('PAROI 500 mg', urunler).kalemler[0].adaylar[0].ad.startsWith('Parol'), true);
  assert.equal(R.mesafe('parol', 'parof'), 1);
  assert.equal(R.mesafe('parol', 'beloc') > 1, true);
  assert.deepEqual(R.receteBilgisi('Tanı: 110 Esansiyel hipertansiyon\nPAROL 110 MG').tanilar, ['I10'], 'tanı satırında 1→I düzeltilir, ilaç satırında değil');
  assert.equal(R.adetBul('X İLAÇ 3 kutu'), 3);
  assert.equal(R.adetBul('X İLAÇ 500 kutu'), 1, 'akla yatkın olmayan adet 1 sayılır');
});

test('reçete okuma API: katalogla eşleştirir, boş metni reddeder', async () => {
  const kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  const r = await kasiyer.post('/api/recete-oku', { metin: 'PAROL 500 MG 20 TABLET 3x1\nCORASPIN 100 MG 30 TB 1x1 2 kutu' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.kalemler.length, 2);
  assert.match(r.data.kalemler[0].adaylar[0].ad, /Parol/);
  assert.equal(r.data.kalemler[0].adaylar[0].kaynak, 'katalog');
  assert.ok(r.data.kalemler[0].adaylar[0].id > 0);
  assert.match(r.data.kalemler[1].adaylar[0].ad, /Coraspin/);
  assert.equal(r.data.kalemler[1].adet, 2);
  assert.equal((await kasiyer.post('/api/recete-oku', { metin: ' ' })).status, 400);
  assert.equal((await kasiyer.post('/api/recete-oku', { metin: 'x'.repeat(20001) })).status, 400);
});
