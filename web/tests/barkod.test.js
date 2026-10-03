const { test } = require('node:test');
const assert = require('node:assert/strict');
const Barkod = require('../public/js/barkod');

test('EAN-13 kontrol hanesi', () => {
  // Bilinen gecerli ornekler
  assert.equal(Barkod.ean13Gecerli('4006381333931'), true);
  assert.equal(Barkod.ean13Gecerli('5901234123457'), true);
  assert.equal(Barkod.ean13Gecerli('5901234123458'), false);
  assert.equal(Barkod.ean13Gecerli('123'), false);
});

test('EAN-13 modul dizisi: 95 modul, koruma cubuklari ve bilinen ilk hane deseni', () => {
  const m = Barkod.ean13Moduller('5901234123457');
  assert.equal(m.length, 95);
  assert.equal(m.slice(0, 3), '101');
  assert.equal(m.slice(45, 50), '01010');
  assert.equal(m.slice(92), '101');
  // Ilk hane 5 -> sol yari deseni LGGLLG; ikinci hane 9 L ile: 0001011
  assert.equal(m.slice(3, 10), '0001011');
  // Ucuncu hane 0 G ile: 0100111
  assert.equal(m.slice(10, 17), '0100111');
  // Sag yarinin ilk hanesi (8. hane = 1) R ile: 1100110
  assert.equal(m.slice(50, 57), '1100110');
});

test('Code 128 tablosu tutarli: her desen 11 modul (bitis 13), desenler benzersiz', () => {
  assert.equal(Barkod.C128.length, 107);
  Barkod.C128.forEach((d, i) => {
    const toplam = [...d].reduce((t, c) => t + Number(c), 0);
    assert.equal(toplam, i === 106 ? 13 : 11, `desen ${i}`);
  });
  assert.equal(new Set(Barkod.C128).size, 107);
});

test('Code 128 B: baslangic, kontrol toplami ve bitis', () => {
  // Kontrol = (104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7) mod 103 = 879 mod 103 = 55
  const d = Barkod.code128Degerleri('PJJ123C');
  assert.equal(d[0], 104);
  assert.deepEqual(d.slice(1, 8), [48, 42, 42, 17, 18, 19, 35]);
  assert.equal(d[8], 55);
  assert.equal(d[9], 106);
  const m = Barkod.code128Moduller('PJJ123C');
  assert.equal(m.length, 11 * 9 + 13);
  assert.ok(m.startsWith('11010010000'), 'Start B deseni');
  assert.ok(m.endsWith('1100011101011'), 'Stop deseni');
});

test('svg: gecerli EAN-13 icin EAN-13, digerleri icin Code 128 secer', () => {
  assert.match(Barkod.svg('5901234123457'), /data-tur="EAN-13"/);
  assert.match(Barkod.svg('8699504010012'), /data-tur="Code 128"/);
  assert.equal(Barkod.svg(''), '');
});
