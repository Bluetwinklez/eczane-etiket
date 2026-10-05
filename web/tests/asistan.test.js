const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { sunucuBaslat, girisliIstemci, istemci } = require('./helpers');
const asistan = require('../server/asistan');
const whatsapp = require('../server/whatsapp');

process.env.WHATSAPP_APP_SECRET = 'test-gizli';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-dogrulama';

let sunucu;
let admin;
let eczaci;
const modelCagrilari = [];
const gonderilenler = [];

before(async () => {
  sunucu = await sunucuBaslat();
  admin = await girisliIstemci(sunucu.base, 'admin');
  eczaci = await girisliIstemci(sunucu.base, 'eczaci');
  asistan.modelIstemcisiAyarla(async (c) => {
    modelCagrilari.push(c);
    return 'Parasetamol ağrı ve ateş düşürücüdür.';
  });
  whatsapp.gondericiAyarla(async (kime, metin) => {
    gonderilenler.push({ kime, metin });
  });
});
after(() => {
  asistan.modelIstemcisiAyarla(null);
  whatsapp.gondericiAyarla(null);
  return sunucu.kapat();
});

function webhookGonder(govde, { imza = true } = {}) {
  const ham = JSON.stringify(govde);
  const headers = { 'content-type': 'application/json' };
  if (imza) headers['x-hub-signature-256'] = 'sha256=' + crypto.createHmac('sha256', 'test-gizli').update(ham).digest('hex');
  return fetch(sunucu.base + '/webhook/whatsapp', { method: 'POST', headers, body: ham });
}
const waMesaj = (from, id, metin) => ({ entry: [{ changes: [{ value: { messages: [{ from, id, type: 'text', text: { body: metin } }] } }] }] });

test('telefon numarasi WhatsApp bicimine cevrilir', () => {
  assert.equal(asistan.telefonSade('0532 123 45 67'), '905321234567');
  assert.equal(asistan.telefonSade('+90 532 123 45 67'), '905321234567');
  assert.equal(asistan.telefonSade('532-123-4567'), '905321234567');
});

test('acil belirtiler modele gitmeden 112 yonlendirmesi alir; eczaci sorusunda tetiklenmez', async () => {
  const onceki = modelCagrilari.length;
  const r = await asistan.cevapla({ kimlik: '905550000001', rol: 'hasta', mesaj: 'Göğüs ağrım var ve nefes alamıyorum' });
  assert.equal(r.acil, true);
  assert.match(r.cevap, /112/);
  assert.equal(modelCagrilari.length, onceki, 'model cagrilmamali');

  const e = await asistan.cevapla({ kimlik: 'web:99', rol: 'eczaci', mesaj: 'Göğüs ağrısı yapabilen ilaçlar hangileri?' });
  assert.equal(e.acil, false);
  assert.equal(modelCagrilari.length, onceki + 1);
});

test('hasta cevabina yerel ilac verisi baglam olur ve uyari notu eklenir; stok gizli kalir', async () => {
  const r = await asistan.cevapla({ kimlik: '905550000002', rol: 'hasta', mesaj: 'Parol ne işe yarar?' });
  const cagri = modelCagrilari[modelCagrilari.length - 1];
  assert.match(cagri.system, /Parol 500mg/);
  assert.match(cagri.system, /parasetamol/);
  assert.doesNotMatch(cagri.system, /stok:/);
  assert.match(cagri.system, /Karşındaki hasta/);
  assert.match(r.cevap, /genel bilgilendirmedir/);
  assert.deepEqual(r.urunler, ['Parol 500mg 20 Tablet']);
});

test('eczaci modu teknik istem ve stok bilgisi alir; birden cok urunde etkilesim baglama girer', async () => {
  await asistan.cevapla({ kimlik: 'web:1', rol: 'eczaci', mesaj: 'Aspirin ile Nurofen birlikte verilir mi?' });
  const cagri = modelCagrilari[modelCagrilari.length - 1];
  assert.match(cagri.system, /Karşındaki eczacı/);
  assert.match(cagri.system, /stok: \d+/);
  assert.match(cagri.system, /Aspirin 100mg/);
  assert.match(cagri.system, /Nurofen 400mg/);
  assert.doesNotMatch(cagri.system, /Hasta kuralları|Karşındaki hasta/);
});

test('model hatasi kullaniciya guvenli mesaj olarak doner', async () => {
  asistan.modelIstemcisiAyarla(async () => {
    throw new Error('ag hatasi');
  });
  const r = await asistan.cevapla({ kimlik: '905550000003', rol: 'hasta', mesaj: 'Parol kaç saatte bir alınır?' });
  assert.equal(r.hata, true);
  assert.match(r.cevap, /eczanemizi arayın/);
  asistan.modelIstemcisiAyarla(async (c) => {
    modelCagrilari.push(c);
    return 'Parasetamol ağrı ve ateş düşürücüdür.';
  });
});

test('gunluk limit asilinca model cagrilmaz', async () => {
  await admin.put('/api/asistan/ayarlar', { hasta_gunluk_limit: 2 });
  const onceki = modelCagrilari.length;
  const kimlik = '905550000004';
  for (let i = 0; i < 2; i++) await asistan.cevapla({ kimlik, rol: 'hasta', mesaj: 'Parol nedir?' });
  const r = await asistan.cevapla({ kimlik, rol: 'hasta', mesaj: 'Parol nedir?' });
  assert.match(r.cevap, /soru sınırı/);
  assert.equal(modelCagrilari.length, onceki + 2);
  await admin.put('/api/asistan/ayarlar', { hasta_gunluk_limit: 30 });
});

test('webhook dogrulamasi: dogru token challenge doner, yanlisi 403', async () => {
  const ok = await fetch(`${sunucu.base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test-dogrulama&hub.challenge=12345`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '12345');
  const kotu = await fetch(`${sunucu.base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=1`);
  assert.equal(kotu.status, 403);
});

test('webhook: imzasiz/yanlis imzali istek reddedilir', async () => {
  assert.equal((await webhookGonder(waMesaj('905551110000', 'wamid.X1', 'Parol'), { imza: false })).status, 401);
  const ham = JSON.stringify(waMesaj('905551110000', 'wamid.X2', 'Parol'));
  const r = await fetch(sunucu.base + '/webhook/whatsapp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
    body: ham
  });
  assert.equal(r.status, 401);
  assert.equal(gonderilenler.length, 0);
});

test('webhook: asistan kapaliyken mesaj islenmez, acilinca hasta ve eczaci ayri modda yanitlanir', async () => {
  assert.equal((await webhookGonder(waMesaj('905551110001', 'wamid.K1', 'Parol nedir?'))).status, 200);
  await whatsapp.bekleyenleriBekle();
  assert.equal(gonderilenler.length, 0, 'asistan kapali');

  assert.equal((await admin.put('/api/asistan/ayarlar', { aktif: true, eczaci_telefonlari: ['0555 222 00 00'] })).status, 200);

  await webhookGonder(waMesaj('905551110001', 'wamid.H1', 'Parol nedir?'));
  await whatsapp.bekleyenleriBekle();
  assert.equal(gonderilenler.length, 1);
  assert.equal(gonderilenler[0].kime, '905551110001');
  assert.match(gonderilenler[0].metin, /genel bilgilendirmedir/);
  assert.match(modelCagrilari[modelCagrilari.length - 1].system, /Karşındaki hasta/);

  await webhookGonder(waMesaj('905552220000', 'wamid.E1', 'Parol max doz?'));
  await whatsapp.bekleyenleriBekle();
  assert.equal(gonderilenler.length, 2);
  assert.equal(gonderilenler[1].kime, '905552220000');
  assert.doesNotMatch(gonderilenler[1].metin, /genel bilgilendirmedir/);
  assert.match(modelCagrilari[modelCagrilari.length - 1].system, /Karşındaki eczacı/);
});

test('webhook: ayni mesaj kimligi iki kez islenmez; metin disi mesaja nazik yanit gider', async () => {
  const onceki = gonderilenler.length;
  await webhookGonder(waMesaj('905551110001', 'wamid.H1', 'Parol nedir?'));
  await whatsapp.bekleyenleriBekle();
  assert.equal(gonderilenler.length, onceki, 'tekrar gelen islenmemeli');

  const gorsel = { entry: [{ changes: [{ value: { messages: [{ from: '905551110002', id: 'wamid.G1', type: 'image' }] } }] }] };
  await webhookGonder(gorsel);
  await whatsapp.bekleyenleriBekle();
  assert.equal(gonderilenler.length, onceki + 1);
  assert.match(gonderilenler[onceki].metin, /yazılı mesaj/);
});

test('webhook: acil mesaj hastaya 112 yonlendirmesi gonderir', async () => {
  const onceki = gonderilenler.length;
  await webhookGonder(waMesaj('905551110003', 'wamid.A1', 'Yanlışlıkla fazla ilaç içtim'));
  await whatsapp.bekleyenleriBekle();
  assert.match(gonderilenler[onceki].metin, /112/);
});

test('web ucu: giris gerekir, eczaci soru sorabilir, bos soru reddedilir', async () => {
  const anonim = istemci(sunucu.base);
  assert.equal((await anonim.post('/api/asistan/sor', { soru: 'Parol' })).status, 401);
  assert.equal((await eczaci.post('/api/asistan/sor', { soru: '' })).status, 400);
  const r = await eczaci.post('/api/asistan/sor', { soru: 'Parol nedir?' });
  assert.equal(r.status, 200);
  assert.match(r.data.cevap, /Parasetamol/);
  assert.deepEqual(r.data.urunler, ['Parol 500mg 20 Tablet']);
});

test('ayarlar: yalniz admin degistirir, girdiler dogrulanir, sir bilgisi sizmaz', async () => {
  assert.equal((await eczaci.put('/api/asistan/ayarlar', { aktif: false })).status, 403);
  assert.equal((await admin.put('/api/asistan/ayarlar', { eczaci_telefonlari: ['abc'] })).status, 400);
  assert.equal((await admin.put('/api/asistan/ayarlar', { hasta_gunluk_limit: 0 })).status, 400);
  const a = (await eczaci.get('/api/asistan/ayarlar')).data;
  assert.equal(a.aktif, true);
  assert.deepEqual(a.eczaci_telefonlari, ['905552220000']);
  assert.equal(typeof a.whatsapp_hazir, 'boolean');
  assert.doesNotMatch(JSON.stringify(a), /test-gizli|test-dogrulama/);
});

test('islem kaydinda soru metni maskelenir', async () => {
  await eczaci.post('/api/asistan/sor', { soru: 'ozel-saglik-sorusu-xyz' });
  const { db } = require('../server/db');
  const kayitlar = db.prepare("SELECT detay FROM islem_kayitlari WHERE yol LIKE '/api/asistan/sor%'").all();
  assert.ok(kayitlar.length > 0);
  assert.ok(kayitlar.every((k) => !String(k.detay).includes('ozel-saglik-sorusu-xyz')));
});
