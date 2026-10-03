// Kaba kuvvet sifre denemelerine karsi: ayni IP + kullanici adi icin
// PENCERE_MS icinde MAKS_DENEME basarisiz girisden sonra gecici kilit.
const MAKS_DENEME = 5;
const PENCERE_MS = 15 * 60 * 1000;

const denemeler = new Map();

function anahtar(ip, kullaniciAdi) {
  return `${ip}|${String(kullaniciAdi).toLowerCase()}`;
}

function kilitliMi(ip, kullaniciAdi) {
  const kayit = denemeler.get(anahtar(ip, kullaniciAdi));
  if (!kayit) return 0;
  if (Date.now() - kayit.ilk > PENCERE_MS) {
    denemeler.delete(anahtar(ip, kullaniciAdi));
    return 0;
  }
  if (kayit.sayi < MAKS_DENEME) return 0;
  return Math.ceil((kayit.ilk + PENCERE_MS - Date.now()) / 1000);
}

function basarisizKaydet(ip, kullaniciAdi) {
  const k = anahtar(ip, kullaniciAdi);
  const kayit = denemeler.get(k);
  if (!kayit || Date.now() - kayit.ilk > PENCERE_MS) {
    denemeler.set(k, { sayi: 1, ilk: Date.now() });
  } else {
    kayit.sayi += 1;
  }
}

function sifirla(ip, kullaniciAdi) {
  denemeler.delete(anahtar(ip, kullaniciAdi));
}

const temizlik = setInterval(() => {
  const simdi = Date.now();
  for (const [k, kayit] of denemeler) {
    if (simdi - kayit.ilk > PENCERE_MS) denemeler.delete(k);
  }
}, PENCERE_MS);
temizlik.unref();

module.exports = { kilitliMi, basarisizKaydet, sifirla, MAKS_DENEME };
