const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sunucuBaslat, girisliIstemci } = require('./helpers');
const { db } = require('../server/db');
const { mevsimselTahmin, sezonBul } = require('../server/mevsimsel');

let sunucu;
before(async () => {
  sunucu = await sunucuBaslat();
});
after(async () => {
  await sunucu.kapat();
});

function satisEkle(ilac, adet, tarih) {
  const s = db.prepare("INSERT INTO satislar (sube_id, toplam_tutar, tarih) VALUES (1, ?, ?)").run(adet * 10, `${tarih} 12:00:00`);
  db.prepare('INSERT INTO satis_kalemleri (satis_id, ilac_id, ilac_adi, adet, birim_fiyat, ara_toplam) VALUES (?, ?, ?, ?, 10, ?)').run(s.lastInsertRowid, ilac.id, ilac.ad, adet, adet * 10);
}

test('sezon takvimi: ay ve ürün adına/ATC sınıfına göre', () => {
  assert.equal(sezonBul({ ad: 'Deniz Suyu Burun Spreyi' }, 12).ad, 'Soğuk algınlığı ve grip');
  assert.equal(sezonBul({ ad: 'Deniz Suyu Burun Spreyi' }, 7), undefined);
  assert.equal(sezonBul({ ad: 'X', atc_kodu: 'R06AE07' }, 4).ad, 'Bahar alerjisi');
  assert.equal(sezonBul({ ad: 'Bioderma Photoderm SPF 50' }, 6).ad, 'Güneş ve sinek mevsimi');
});

test('mevsimsel tahmin: geçen yıl aynı dönem artışı ve takvim; sipariş önerisi', async () => {
  const admin = await girisliIstemci(sunucu.base, 'admin');
  const yeni = async (ad, stok) => (await admin.post('/api/ilaclar', { ad, satis_fiyati: 10, stok })).data;
  const surup = await yeni('Öksürük Test Şurubu', 5); // gecen yil donem artisi
  const sprey = await yeni('Deniz Suyu Burun Spreyi Test', 3); // gecmisi yok, takvimden
  const sabit = await yeni('Sabit Satan Test', 50);

  // bugun = 2026-11-01; son 30 gun: 2026-10-02..10-31; gecen yil once: 2025-10-02..10-31, sonra: 2025-11-01..11-30
  satisEkle(surup, 10, '2026-10-15');
  satisEkle(surup, 4, '2025-10-15');
  satisEkle(surup, 12, '2025-11-15');
  satisEkle(sprey, 6, '2026-10-20');
  satisEkle(sabit, 10, '2026-10-10');
  satisEkle(sabit, 10, '2025-10-10');
  satisEkle(sabit, 10, '2025-11-10');

  const t = mevsimselTahmin(1, { gun: 30, bugun: new Date('2026-11-01T09:00:00Z') });
  assert.equal(t.ay, 11);
  assert.ok(t.sezonlar.includes('Soğuk algınlığı ve grip'));
  const s = t.urunler.find((u) => u.id === surup.id);
  assert.equal(s.kaynak, 'gecen_yil');
  assert.equal(s.carpan, 2.6, '(12+1)/(4+1)');
  assert.equal(s.tahmin, 26);
  assert.equal(s.oneri, 21);
  const p = t.urunler.find((u) => u.id === sprey.id);
  assert.equal(p.kaynak, 'takvim');
  assert.equal(p.tahmin, 10, '6 x 1,6');
  assert.equal(p.oneri, 7);
  assert.ok(!t.urunler.some((u) => u.id === sabit.id), 'artış yok, stok yeterli → listelenmez');
  assert.equal(t.urunler[0].id, surup.id, 'en çok öneri önce');

  // API (bugunun tarihiyle calisir) ve yetki
  const kasiyer = await girisliIstemci(sunucu.base, 'kasiyer');
  assert.equal((await kasiyer.get('/api/siparisler/mevsimsel')).status, 403);
  const r = await admin.get('/api/siparisler/mevsimsel?gun=30');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.urunler) && Array.isArray(r.data.kategoriler));
});
