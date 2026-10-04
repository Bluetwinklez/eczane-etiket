const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');
const { indirimYuzdesi } = require('../server/oneriler');
const { yerelSimdi } = require('../server/zaman');

let sunucu;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

// Uygulama "bugün"ü yerel (Türkiye) takvimine göre sayar; test de aynı takvimi kullanmalı (UTC'ye göre değil)
const gunOnce = (n) => {
  const d = yerelSimdi();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test('akıllı uyarılar oturum ister; boş veride mantıklı varsayılanlar döner', async () => {
  assert.equal((await fetch(sunucu.base + '/api/oneriler')).status, 401);
  const o = (await kasiyer.get('/api/oneriler')).data;
  assert.ok(Array.isArray(o.mesajlar) && Array.isArray(o.bitmek_uzere) && Array.isArray(o.skt_indirim));
  assert.equal(o.gun_sonu.satis_adedi, 0);
  assert.equal(o.gun_sonu.ciro, 0);
});

test('indirim oranı kalan güne göre kademeli', () => {
  assert.equal(indirimYuzdesi(10), 30);
  assert.equal(indirimYuzdesi(30), 30);
  assert.equal(indirimYuzdesi(31), 20);
  assert.equal(indirimYuzdesi(60), 20);
  assert.equal(indirimYuzdesi(61), 10);
});

test('stok bitiş tahmini: hızlı tükenen ürün öne çıkar, satılmayan çıkmaz', async () => {
  const [a, b] = db.prepare('SELECT id, ad FROM ilaclar ORDER BY id LIMIT 2').all();
  // A: son 30 günde 30 adet satıldı (günde 1), stok 3 -> 3 gün yeter
  const sat = db.prepare("INSERT INTO satislar (sube_id, kullanici_id, ara_toplam, toplam_tutar, odeme_tipi, tarih) VALUES (1, 1, 10, 10, 'nakit', datetime('now', '-5 days'))");
  const kalem = db.prepare('INSERT INTO satis_kalemleri (satis_id, ilac_id, ilac_adi, adet, birim_fiyat, alis_fiyati, ara_toplam) VALUES (?, ?, ?, 30, 1, 0.5, 30)');
  kalem.run(sat.run().lastInsertRowid, a.id, a.ad);
  db.prepare('UPDATE ilac_stok SET stok = 3 WHERE ilac_id = ? AND sube_id = 1').run(a.id);
  db.prepare('UPDATE ilac_stok SET stok = 500 WHERE ilac_id = ? AND sube_id = 1').run(b.id);

  const o = (await kasiyer.get('/api/oneriler')).data;
  const kayit = o.bitmek_uzere.find((x) => x.ilac_id === a.id);
  assert.ok(kayit, 'hızlı tükenen ürün listede');
  assert.equal(kayit.yetecek_gun, 3);
  assert.equal(kayit.durum, 'yakinda');
  assert.equal(kayit.onerilen_adet, 27, '30 günlük ihtiyaç 30 - stok 3');
  assert.ok(!o.bitmek_uzere.some((x) => x.ilac_id === b.id), 'hiç satılmayan ürün önerilmez');
  assert.ok(o.mesajlar.some((m) => m.tur === 'stok'));
});

test('SKT: satılamayacak fazla stok için indirim; süresi geçmiş parti ayrı bildirilir', async () => {
  const [, b, c] = db.prepare('SELECT id, ad, alis_fiyati, satis_fiyati FROM ilaclar ORDER BY id LIMIT 3').all();
  const ekle = db.prepare('INSERT INTO ilac_partileri (ilac_id, sube_id, parti_no, skt, giris_miktari, miktar) VALUES (?, 1, ?, ?, ?, ?)');
  ekle.run(b.id, 'YAKIN-1', gunOnce(20), 100, 100);
  ekle.run(c.id, 'GECMIS-1', gunOnce(-2), 5, 5);

  const o = (await kasiyer.get('/api/oneriler')).data;
  const yakin = o.skt_indirim.find((x) => x.parti_no === 'YAKIN-1');
  assert.ok(yakin);
  assert.equal(yakin.tur, 'yaklasan');
  assert.equal(yakin.kalan_gun, 20);
  assert.equal(yakin.fazla, 100, 'bu ürün hiç satılmıyor, tüm parti fazla');
  assert.equal(yakin.onerilen_indirim, 30);
  assert.equal(yakin.indirimli_fiyat, Math.round(b.satis_fiyati * 0.7 * 100) / 100);
  assert.equal(yakin.tahmini_zarar, Math.round(100 * b.alis_fiyati * 100) / 100);

  const gecmis = o.skt_indirim.find((x) => x.parti_no === 'GECMIS-1');
  assert.equal(gecmis.tur, 'dolmus');
  assert.ok(gecmis.kalan_gun < 0);
  assert.equal(o.skt_indirim[0].tur, 'dolmus', 'süresi dolanlar listenin başında');
  assert.ok(o.mesajlar.some((m) => m.tur === 'skt' && m.onem === 'yuksek'));
});

test('SKT: hızlı satılan ürünün partisi için indirim önerilmez', async () => {
  const [a] = db.prepare('SELECT id FROM ilaclar ORDER BY id LIMIT 1').all();
  // A günde 1 adet satıyor; 10 gün sonra dolacak 5 adetlik parti zaten satılır
  db.prepare('INSERT INTO ilac_partileri (ilac_id, sube_id, parti_no, skt, giris_miktari, miktar) VALUES (?, 1, ?, ?, 5, 5)').run(a.id, 'HIZLI-1', gunOnce(10));
  const o = (await kasiyer.get('/api/oneriler')).data;
  assert.ok(!o.skt_indirim.some((x) => x.parti_no === 'HIZLI-1'));
});

test('ölü stok ve gün sonu özeti', async () => {
  const o = (await kasiyer.get('/api/oneriler')).data;
  assert.ok(o.olu_stok.adet >= 1);
  assert.ok(o.olu_stok.bagli_sermaye > 0);
  assert.ok(o.olu_stok.ilk.length <= 3);

  const urun = db.prepare('SELECT id, satis_fiyati FROM ilaclar WHERE receteli = 0 AND recete_turu IS NULL AND id > 3 LIMIT 1').get();
  const satis = (await kasiyer.post('/api/satislar', { kalemler: [{ ilac_id: urun.id, adet: 2 }] })).data;
  const g = (await kasiyer.get('/api/oneriler')).data.gun_sonu;
  assert.equal(g.satis_adedi, 1);
  assert.equal(g.ciro, satis.toplam_tutar);
  assert.ok(g.kar > 0 && g.kar < g.ciro);
  assert.equal(g.en_cok_satan.adet, 2);
});
