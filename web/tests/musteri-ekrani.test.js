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

// SSE akisindan siradaki "data:" mesajini okur
function akisAc(url) {
  const kontrol = new AbortController();
  const yanitP = fetch(url, { signal: kontrol.signal });
  let tampon = '';
  let okuyucu;
  const sonraki = async () => {
    if (!okuyucu) okuyucu = (await yanitP).body.getReader();
    for (;;) {
      const i = tampon.indexOf('\n\n');
      if (i >= 0) {
        const blok = tampon.slice(0, i);
        tampon = tampon.slice(i + 2);
        if (blok.startsWith('data: ')) return JSON.parse(blok.slice(6));
        continue;
      }
      const { value, done } = await okuyucu.read();
      if (done) return null;
      tampon += Buffer.from(value).toString('utf8');
    }
  };
  return { yanitP, sonraki, kapat: () => kontrol.abort() };
}

test('müşteri ekranı: anahtarlı canlı akış, kişisel veri yok, adres yenilenince eski ekran kapanır', async () => {
  const eczaci = await girisliIstemci(sunucu.base, 'eczaci');
  const kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  assert.equal((await kasiyer.get('/api/musteri-ekrani/anahtar')).status, 403, 'kasiyer adres alamaz');
  const { anahtar, adres } = (await eczaci.get('/api/musteri-ekrani/anahtar')).data;
  assert.ok(anahtar.length >= 20);
  assert.equal(adres, `/musteri-ekrani.html#${anahtar}`);
  assert.equal((await fetch(`${sunucu.base}/api/musteri-ekrani/akis?anahtar=yanlis`)).status, 403);
  assert.equal((await fetch(`${sunucu.base}/api/musteri-ekrani`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401, 'durum göndermek giriş ister');

  const akis = akisAc(`${sunucu.base}/api/musteri-ekrani/akis?anahtar=${anahtar}`);
  assert.equal((await akis.yanitP).headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const ilk = await akis.sonraki();
  assert.equal(ilk.durum, 'bos');
  assert.ok(ilk.sube);

  // Kasiyer (ayni sube) sepet gonderir; fazla alanlar (musteri adi) suzulur
  const r = await kasiyer.post('/api/musteri-ekrani', { kalemler: [{ ad: 'Parol 500mg', adet: 2, tutar: 49.8, gizli: 'x' }], ara_toplam: 49.8, indirim: 0, toplam: 49.8, musteri_adi: 'Ahmet Yılmaz' });
  assert.equal(r.data.dinleyen, 1);
  const d = await akis.sonraki();
  assert.equal(d.durum, 'sepet');
  assert.deepEqual(d.kalemler, [{ ad: 'Parol 500mg', adet: 2, tutar: 49.8 }]);
  assert.equal(d.toplam, 49.8);
  assert.equal(d.musteri_adi, undefined);

  await kasiyer.post('/api/musteri-ekrani', { durum: 'tesekkur', toplam: 49.8 });
  assert.equal((await akis.sonraki()).durum, 'tesekkur');

  // Yeni adres: eski akis kapanir, eski anahtar gecersiz
  const yeni = (await eczaci.get('/api/musteri-ekrani/anahtar?yenile=1')).data.anahtar;
  assert.notEqual(yeni, anahtar);
  assert.equal(await akis.sonraki(), null, 'eski ekran kapandı');
  assert.equal((await fetch(`${sunucu.base}/api/musteri-ekrani/akis?anahtar=${anahtar}`)).status, 403);
  akis.kapat();
});
