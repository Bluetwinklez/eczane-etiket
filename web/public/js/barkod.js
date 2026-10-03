// Barkod cizici: gecerli EAN-13 icin EAN-13, digerleri icin Code 128 (B) SVG uretir.
// Tarayicida window.Barkod, Node'da (testler) module.exports olarak kullanilir.
(function (kok) {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  // Ilk hane, sol yarim 6 hanenin L/G kodlanma desenini belirler
  const PARITE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  function ean13KontrolHanesi(ilk12) {
    let toplam = 0;
    for (let i = 0; i < 12; i++) toplam += Number(ilk12[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (toplam % 10)) % 10;
  }

  function ean13Gecerli(kod) {
    return /^\d{13}$/.test(kod) && ean13KontrolHanesi(kod.slice(0, 12)) === Number(kod[12]);
  }

  // 95 modul: 101 + 6 sol hane + 01010 + 6 sag hane + 101
  function ean13Moduller(kod) {
    const parite = PARITE[Number(kod[0])];
    let m = '101';
    for (let i = 1; i <= 6; i++) m += (parite[i - 1] === 'L' ? L : G)[Number(kod[i])];
    m += '01010';
    for (let i = 7; i <= 12; i++) m += R[Number(kod[i])];
    return m + '101';
  }

  // Code 128 desenleri (cubuk/bosluk genislikleri); 103-105 baslangic, 106 bitis
  const C128 = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];

  function code128Degerleri(metin) {
    const degerler = [104]; // Start B
    for (const ch of metin) {
      const kodu = ch.charCodeAt(0);
      if (kodu < 32 || kodu > 126) throw new Error('Code 128 B yalnizca ASCII 32-126 kodlayabilir');
      degerler.push(kodu - 32);
    }
    let toplam = degerler[0];
    for (let i = 1; i < degerler.length; i++) toplam += degerler[i] * i;
    degerler.push(toplam % 103, 106);
    return degerler;
  }

  function code128Moduller(metin) {
    let m = '';
    for (const d of code128Degerleri(metin)) {
      const desen = C128[d];
      for (let i = 0; i < desen.length; i++) m += (i % 2 === 0 ? '1' : '0').repeat(Number(desen[i]));
    }
    return m;
  }

  function moduller(kod) {
    const s = String(kod || '').trim();
    if (!s) return null;
    if (ean13Gecerli(s)) return { tur: 'EAN-13', moduller: ean13Moduller(s) };
    return { tur: 'Code 128', moduller: code128Moduller(s) };
  }

  // Ardisik 1'leri tek dikdortgende birlestirir; sessiz bolge icin iki yanda 10 modul bosluk
  function svg(kod, secenek) {
    const b = moduller(kod);
    if (!b) return '';
    const yukseklik = (secenek && secenek.yukseklik) || 40;
    const bosluk = 10;
    const genislik = b.moduller.length + bosluk * 2;
    let cubuklar = '';
    let i = 0;
    while (i < b.moduller.length) {
      if (b.moduller[i] === '1') {
        let j = i;
        while (j < b.moduller.length && b.moduller[j] === '1') j++;
        cubuklar += `<rect x="${i + bosluk}" y="0" width="${j - i}" height="${yukseklik}"/>`;
        i = j;
      } else {
        i++;
      }
    }
    return `<svg class="barkod-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${genislik} ${yukseklik}" preserveAspectRatio="none" data-tur="${b.tur}" role="img" aria-label="${b.tur} ${String(kod).replace(/"/g, '')}"><rect width="${genislik}" height="${yukseklik}" fill="#fff"/><g fill="#000">${cubuklar}</g></svg>`;
  }

  const Barkod = { ean13Gecerli, ean13KontrolHanesi, ean13Moduller, code128Degerleri, code128Moduller, moduller, svg, C128 };
  if (typeof module !== 'undefined' && module.exports) module.exports = Barkod;
  else kok.Barkod = Barkod;
})(typeof window !== 'undefined' ? window : globalThis);
