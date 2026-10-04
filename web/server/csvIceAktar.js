const { URUN_TIPLERI } = require('./sabitler');

// Basit ama dogru CSV ayristirici: tirnakli alanlar, "" kacisi, BOM, \r\n
function csvAyristir(metin) {
  const s = String(metin || '').replace(/^﻿/, '');
  const ilkSatir = s.split(/\r?\n/, 1)[0] || '';
  const ayirac = [';', '\t', ','].reduce((en, a) => (ilkSatir.split(a).length > ilkSatir.split(en).length ? a : en), ';');

  const satirlar = [];
  let alan = '';
  let satir = [];
  let tirnak = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (tirnak) {
      if (c === '"' && s[i + 1] === '"') {
        alan += '"';
        i++;
      } else if (c === '"') {
        tirnak = false;
      } else {
        alan += c;
      }
    } else if (c === '"') {
      tirnak = true;
    } else if (c === ayirac) {
      satir.push(alan);
      alan = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      satir.push(alan);
      satirlar.push(satir);
      satir = [];
      alan = '';
    } else {
      alan += c;
    }
  }
  if (alan !== '' || satir.length) {
    satir.push(alan);
    satirlar.push(satir);
  }
  return satirlar.filter((r) => r.some((h) => h.trim() !== ''));
}

function anahtar(metin) {
  return String(metin || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

// Basliklar Turkce/Ingilizce ve farkli yazimlarla gelebilir
const BASLIKLAR = {
  ad: ['ad', 'urun', 'urunadi', 'ilac', 'ilacadi', 'name'],
  barkod: ['barkod', 'barcode', 'ean', 'gtin'],
  kategori: ['kategori', 'category'],
  uretici: ['uretici', 'firma', 'marka', 'manufacturer'],
  receteli: ['receteli', 'recete', 'prescription'],
  alis_fiyati: ['alisfiyati', 'alis', 'maliyet', 'cost'],
  satis_fiyati: ['satisfiyati', 'satis', 'fiyat', 'psf', 'price'],
  kritik_stok: ['kritikstok', 'kritik', 'minstok'],
  urun_tipi: ['uruntipi', 'tip', 'tur'],
  etken_madde: ['etkenmadde', 'etken', 'activeingredient'],
  kutu_gun: ['kutugun', 'birkutukacgunyeter', 'kutusuresi'],
  skt: ['skt', 'sonkullanmatarihi', 'varsayilanskt']
};

function sayi(metin) {
  const s = String(metin).trim().replace(/\s/g, '').replace(/TL$/i, '');
  if (s === '') return null;
  // "1.234,56" -> 1234.56 ; "24,90" -> 24.90 ; "24.90" -> 24.90
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

function evetHayir(metin) {
  const a = anahtar(metin);
  if (['evet', 'e', '1', 'true', 'var', 'yes', 'x'].includes(a)) return 1;
  if (['hayir', 'h', '0', 'false', 'yok', 'no', ''].includes(a)) return 0;
  return null;
}

function urunTipiCoz(metin) {
  const a = anahtar(metin);
  if (!a) return null;
  for (const [kod, etiket] of Object.entries(URUN_TIPLERI)) {
    if (a === anahtar(kod) || a === anahtar(etiket)) return kod;
  }
  if (a === 'takviye' || a === 'gidatakviyesi' || a === 'vitamin') return 'takviye';
  if (a === 'medikal' || a === 'medikalurun') return 'medikal';
  return undefined;
}

function tarihCoz(metin) {
  const s = String(metin).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

// Her satiri { alanlar, hatalar } olarak cozer; yalnizca dolu hucreler alana yazilir
function satirlariCoz(metin) {
  const tablo = csvAyristir(metin);
  if (tablo.length < 2) return { hata: 'Dosyada baslik satiri ve en az bir urun satiri olmali' };
  const sutunlar = tablo[0].map((b) => {
    const a = anahtar(b);
    return Object.keys(BASLIKLAR).find((alan) => BASLIKLAR[alan].includes(a)) || null;
  });
  if (!sutunlar.includes('ad') && !sutunlar.includes('barkod')) {
    return { hata: 'Baslikta en az "Ad" veya "Barkod" sutunu olmali' };
  }

  const satirlar = tablo.slice(1).map((hucreler, idx) => {
    const alanlar = {};
    const hatalar = [];
    sutunlar.forEach((alan, i) => {
      if (!alan) return;
      const ham = (hucreler[i] ?? '').trim();
      if (ham === '') return;
      if (['alis_fiyati', 'satis_fiyati'].includes(alan)) {
        const n = sayi(ham);
        if (Number.isNaN(n) || n < 0) hatalar.push(`${alan} gecersiz: "${ham}"`);
        else alanlar[alan] = Math.round(n * 100) / 100;
      } else if (['kritik_stok', 'kutu_gun'].includes(alan)) {
        const n = sayi(ham);
        if (!Number.isInteger(n) || n < 0 || (alan === 'kutu_gun' && (n < 1 || n > 365))) hatalar.push(`${alan} gecersiz: "${ham}"`);
        else alanlar[alan] = n;
      } else if (alan === 'receteli') {
        const v = evetHayir(ham);
        if (v === null) hatalar.push(`receteli gecersiz: "${ham}"`);
        else alanlar.receteli = v;
      } else if (alan === 'urun_tipi') {
        const v = urunTipiCoz(ham);
        if (!v) hatalar.push(`urun tipi taninmadi: "${ham}"`);
        else alanlar.urun_tipi = v;
      } else if (alan === 'skt') {
        const v = tarihCoz(ham);
        if (!v) hatalar.push(`SKT gecersiz: "${ham}"`);
        else alanlar.skt = v;
      } else if (alan === 'etken_madde') {
        alanlar.etken_madde = ham.toLocaleLowerCase('tr-TR').split(/[,+;/]/).map((m) => m.trim()).filter(Boolean).join(', ');
      } else {
        alanlar[alan] = ham;
      }
    });
    return { satir: idx + 2, alanlar, hatalar };
  });
  return { sutunlar: sutunlar.filter(Boolean), satirlar };
}

const SABLON_BASLIK = 'Ad;Barkod;Kategori;Uretici;Receteli;Alis Fiyati;Satis Fiyati;Kritik Stok;Urun Tipi;Etken Madde;Kutu Gun;SKT';
const SABLON = `${SABLON_BASLIK}\r\nOrnek Vitamin C 1000mg 30 Tablet;8690000000001;Vitamin;Ornek Firma;Hayir;80,00;129,90;5;Gida Takviyesi;askorbik asit;30;31.12.2027\r\n`;

module.exports = { csvAyristir, satirlariCoz, SABLON };
