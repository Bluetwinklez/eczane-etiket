const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');

let sunucu;
let kasiyer;

before(async () => {
  sunucu = await sunucuBaslat();
  kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
});
after(() => sunucu.kapat());

function satisEkle(ilacId, adet, gunOnce) {
  const id = Number(
    db
      .prepare("INSERT INTO satislar (sube_id, kullanici_id, ara_toplam, toplam_tutar, odeme_tipi, tarih) VALUES (1, 1, 10, 10, 'nakit', datetime('now', ?))")
      .run(`-${gunOnce} days`).lastInsertRowid
  );
  db.prepare('INSERT INTO satis_kalemleri (satis_id, ilac_id, ilac_adi, adet, birim_fiyat, alis_fiyati, ara_toplam) VALUES (?, ?, ?, ?, 1, 0.5, ?)').run(id, ilacId, 'x', adet, adet);
  return id;
}

test('ürün analizi: oturum ister, bilinmeyen ürün 404', async () => {
  assert.equal((await fetch(sunucu.base + '/api/ilaclar/1/analiz')).status, 401);
  assert.equal((await kasiyer.get('/api/ilaclar/999999/analiz')).status, 404);
});

test('ürün analizi: haftalık kırılım, günlük ortalama ve yetecek gün', async () => {
  const ilac = db.prepare('SELECT id FROM ilaclar ORDER BY id LIMIT 1').get();
  db.prepare('UPDATE ilac_stok SET stok = 15 WHERE ilac_id = ? AND sube_id = 1').run(ilac.id);
  satisEkle(ilac.id, 6, 25); // 1. hafta (28-21 gün önce)
  satisEkle(ilac.id, 3, 10); // 3. hafta (14-7)
  satisEkle(ilac.id, 9, 2); //  4. hafta (7-0)
  satisEkle(ilac.id, 100, 45); // 30 günün dışında: sayılmaz

  const a = (await kasiyer.get(`/api/ilaclar/${ilac.id}/analiz`)).data;
  assert.deepEqual(a.haftalik, [6, 0, 3, 9]);
  assert.equal(a.son_30_gun_satis, 18);
  assert.equal(a.gunluk_ortalama, 0.6);
  assert.equal(a.stok, 15);
  assert.equal(a.yetecek_gun, 25); // 15 / 0.6
  assert.ok(a.son_satis);
});

test('ürün analizi: stoğa alınan iade net satıştan düşer; satışsız ürünün yetecek günü yok', async () => {
  const [, b] = db.prepare('SELECT id FROM ilaclar ORDER BY id LIMIT 2').all();
  const satisId = satisEkle(b.id, 10, 3);
  const kalem = db.prepare('SELECT id FROM satis_kalemleri WHERE satis_id = ?').get(satisId);
  const iade = Number(db.prepare("INSERT INTO iadeler (satis_id, sube_id, kullanici_id, toplam_tutar, odeme_tipi, stoga_alindi) VALUES (?, 1, 1, 4, 'nakit', 1)").run(satisId).lastInsertRowid);
  db.prepare('INSERT INTO iade_kalemleri (iade_id, satis_kalem_id, ilac_id, ilac_adi, adet, tutar, alis_fiyati) VALUES (?, ?, ?, ?, 4, 4, 0.5)').run(iade, kalem.id, b.id, 'x');
  const a = (await kasiyer.get(`/api/ilaclar/${b.id}/analiz`)).data;
  assert.equal(a.son_30_gun_satis, 6);

  const c = db.prepare('SELECT id FROM ilaclar ORDER BY id DESC LIMIT 1').get();
  const bos = (await kasiyer.get(`/api/ilaclar/${c.id}/analiz`)).data;
  assert.equal(bos.son_30_gun_satis, 0);
  assert.equal(bos.yetecek_gun, null);
  assert.equal(bos.son_satis, null);
});
