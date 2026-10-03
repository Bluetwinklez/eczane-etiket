const { db } = require('./db');

function yuvarla(n) {
  return Math.round(n * 100) / 100;
}

function musteriBakiyesi(musteriId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN tip = 'borc' THEN tutar ELSE -tutar END), 0) AS bakiye
       FROM cari_hareketler WHERE musteri_id = ?`
    )
    .get(musteriId);
  return yuvarla(row.bakiye);
}

function cariHareketEkle({ musteri_id, sube_id, tip, tutar, satis_id, odeme_tipi, aciklama, kullanici_id }) {
  const info = db
    .prepare(
      `INSERT INTO cari_hareketler (musteri_id, sube_id, tip, tutar, satis_id, odeme_tipi, aciklama, kullanici_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(musteri_id, sube_id || null, tip, yuvarla(tutar), satis_id || null, odeme_tipi || null, aciklama || null, kullanici_id || null);
  return Number(info.lastInsertRowid);
}

module.exports = { musteriBakiyesi, cariHareketEkle, yuvarla };
