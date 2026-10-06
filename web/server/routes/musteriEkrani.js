// Musteri ekrani: kasadaki sepet ve toplam ikinci monitorde ya da tezgahtaki tablette canli gosterilir.
// Kasa (girisli) durumu gonderir; ekran sayfasi subeye ozel gizli anahtarla canli akisi (SSE) dinler.
// Ekrana musteri adi, telefon gibi kisisel bilgi gonderilmez.
const express = require('express');
const crypto = require('crypto');
const { db, ayarOku, ayarYaz } = require('../db');
const { requireLogin, requireRole } = require('../auth');

const durumlar = new Map(); // sube_id -> son durum
const dinleyiciler = new Map(); // sube_id -> Set(res)

const anahtarAdi = (sube) => `musteri_ekrani_anahtari_${sube}`;
function anahtarGetir(sube, yenile = false) {
  let a = ayarOku(anahtarAdi(sube));
  if (!a || yenile) {
    a = crypto.randomBytes(18).toString('base64url');
    ayarYaz(anahtarAdi(sube), a);
  }
  return a;
}
function anahtardanSube(anahtar) {
  if (!anahtar || typeof anahtar !== 'string') return null;
  for (const s of db.prepare('SELECT id, ad FROM subeler').all()) {
    const k = ayarOku(anahtarAdi(s.id));
    if (k && k.length === anahtar.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(anahtar))) return s;
  }
  return null;
}

const sayi = (n) => Math.round((Number(n) || 0) * 100) / 100;
function temizle(b, subeAdi) {
  const kalemler = (Array.isArray(b.kalemler) ? b.kalemler : []).slice(0, 60).map((k) => ({
    ad: String(k.ad || '').slice(0, 80),
    adet: Math.max(0, Math.min(999, Number(k.adet) || 0)),
    tutar: sayi(k.tutar)
  }));
  return {
    durum: ['sepet', 'tesekkur', 'bos'].includes(b.durum) ? b.durum : kalemler.length ? 'sepet' : 'bos',
    kalemler,
    ara_toplam: sayi(b.ara_toplam),
    indirim: sayi(b.indirim),
    toplam: sayi(b.toplam),
    sube: subeAdi,
    zaman: Date.now()
  };
}

function yayinla(sube, durum) {
  durumlar.set(sube, durum);
  for (const res of dinleyiciler.get(sube) || []) res.write(`data: ${JSON.stringify(durum)}\n\n`);
}

// Girisli kasa: durum gonderir
const kasa = express.Router();
kasa.post('/', (req, res) => {
  const s = db.prepare('SELECT ad FROM subeler WHERE id = ?').get(req.user.sube_id);
  yayinla(req.user.sube_id, temizle(req.body || {}, s ? s.ad : ''));
  res.json({ ok: true, dinleyen: (dinleyiciler.get(req.user.sube_id) || new Set()).size });
});
kasa.get('/anahtar', requireRole('admin', 'eczaci'), (req, res) => {
  const yenile = req.query.yenile === '1';
  const anahtar = anahtarGetir(req.user.sube_id, yenile);
  // Adres yenilenince eski adresle acik ekranlar kapatilir
  if (yenile) for (const r of dinleyiciler.get(req.user.sube_id) || []) r.end();
  res.json({ anahtar, adres: `/musteri-ekrani.html#${anahtar}` });
});

// Anahtarli, girissiz canli akis (tablet / ikinci ekran)
const akis = express.Router();
akis.get('/', (req, res) => {
  const sube = anahtardanSube(String(req.query.anahtar || ''));
  if (!sube) return res.status(403).json({ error: 'Geçersiz ekran anahtarı' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify(durumlar.get(sube.id) || { durum: 'bos', kalemler: [], toplam: 0, sube: sube.ad })}\n\n`);
  if (!dinleyiciler.has(sube.id)) dinleyiciler.set(sube.id, new Set());
  dinleyiciler.get(sube.id).add(res);
  const nabiz = setInterval(() => res.write(': nabiz\n\n'), 25000);
  req.on('close', () => {
    clearInterval(nabiz);
    dinleyiciler.get(sube.id).delete(res);
  });
});

module.exports = { kasa: [requireLogin, kasa], akis };
