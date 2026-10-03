const { db } = require('./db');

// Partiler FEFO (ilk son kullanma tarihi ilk cikar) sirasiyla tuketilir:
// SKT'si en yakin olan once, SKT'siz partiler en son.
const FEFO_SIRASI = 'ORDER BY (skt IS NULL), skt, id';

function partiGiris(ilacId, subeId, adet, { parti_no, skt, kaynak } = {}) {
  const miktar = Number(adet);
  if (!(miktar > 0)) return null;

  const partiNo = parti_no ? String(parti_no).trim() || null : null;
  let sonSkt = skt || null;
  if (!sonSkt) {
    const ilac = db.prepare('SELECT skt FROM ilaclar WHERE id = ?').get(ilacId);
    sonSkt = ilac ? ilac.skt : null;
  }

  // Ayni parti numarasi ve SKT ile tekrar giris yapilirsa mevcut partiye eklenir
  if (partiNo) {
    const mevcut = db
      .prepare('SELECT id FROM ilac_partileri WHERE ilac_id = ? AND sube_id = ? AND parti_no = ? AND skt IS ?')
      .get(ilacId, subeId, partiNo, sonSkt);
    if (mevcut) {
      db.prepare('UPDATE ilac_partileri SET miktar = miktar + ?, giris_miktari = giris_miktari + ? WHERE id = ?').run(
        miktar,
        miktar,
        mevcut.id
      );
      return mevcut.id;
    }
  }

  const info = db
    .prepare(
      `INSERT INTO ilac_partileri (ilac_id, sube_id, parti_no, skt, giris_miktari, miktar, kaynak)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(ilacId, subeId, partiNo, sonSkt, miktar, miktar, kaynak || null);
  return Number(info.lastInsertRowid);
}

// Verilen miktari partilerden duser ve hangi partiden ne kadar dusuldugunu
// doner. parti_id verilirse sadece o partiden duser.
function partiCikis(ilacId, subeId, adet, partiId) {
  let kalan = Number(adet);
  const dagilim = [];
  const partiler = partiId
    ? db
        .prepare('SELECT id, miktar FROM ilac_partileri WHERE id = ? AND ilac_id = ? AND sube_id = ? AND miktar > 0')
        .all(partiId, ilacId, subeId)
    : db
        .prepare(`SELECT id, miktar FROM ilac_partileri WHERE ilac_id = ? AND sube_id = ? AND miktar > 0 ${FEFO_SIRASI}`)
        .all(ilacId, subeId);

  const guncelle = db.prepare('UPDATE ilac_partileri SET miktar = miktar - ? WHERE id = ?');
  for (const parti of partiler) {
    if (kalan <= 0) break;
    const dus = Math.min(parti.miktar, kalan);
    guncelle.run(dus, parti.id);
    dagilim.push({ parti_id: parti.id, adet: dus });
    kalan -= dus;
  }
  return dagilim;
}

// Iade gibi durumlarda miktari belirli bir partiye geri ekler
function partiyeGeriEkle(partiId, adet) {
  const sonuc = db.prepare('UPDATE ilac_partileri SET miktar = miktar + ? WHERE id = ?').run(Number(adet), partiId);
  return sonuc.changes > 0;
}

function partiMiktariniKontrolEt(partiId, ilacId, subeId) {
  return db.prepare('SELECT * FROM ilac_partileri WHERE id = ? AND ilac_id = ? AND sube_id = ?').get(partiId, ilacId, subeId);
}

// ilac_stok ile parti toplamlari arasindaki farki kapatir. Partiler eklenmeden
// once olusmus stok (veya parti icermeyen bir yedekten geri yukleme) icin
// ilacin varsayilan SKT'si ile bir "acilis" partisi olusturulur.
function partileriEsitle() {
  const farklar = db
    .prepare(
      `SELECT s.ilac_id, s.sube_id, s.stok, COALESCE(SUM(p.miktar), 0) AS parti_toplam
       FROM ilac_stok s
       LEFT JOIN ilac_partileri p ON p.ilac_id = s.ilac_id AND p.sube_id = s.sube_id
       GROUP BY s.ilac_id, s.sube_id
       HAVING s.stok != parti_toplam`
    )
    .all();

  for (const f of farklar) {
    if (f.stok > f.parti_toplam) {
      partiGiris(f.ilac_id, f.sube_id, f.stok - f.parti_toplam, { kaynak: 'acilis' });
    } else {
      partiCikis(f.ilac_id, f.sube_id, f.parti_toplam - f.stok);
    }
  }
  return farklar.length;
}

module.exports = { partiGiris, partiCikis, partiyeGeriEkle, partiMiktariniKontrolEt, partileriEsitle, FEFO_SIRASI };
