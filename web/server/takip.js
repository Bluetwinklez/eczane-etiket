// Musteri olcumu degerlendirmesi. Esikler yaygin klinik kilavuz degerleridir
// (tansiyon: ESH/ESC 2023, seker: ADA, SpO2, ates); yorum degil, dikkat cekme amaclidir.
const TIPLER = {
  tansiyon: { ad: 'Tansiyon', birim: 'mmHg', iki: true, aralik: [[40, 300], [20, 200]] },
  seker: { ad: 'Kan şekeri', birim: 'mg/dl', aralik: [[10, 1000]] },
  nabiz: { ad: 'Nabız', birim: '/dk', aralik: [[20, 250]] },
  ates: { ad: 'Ateş', birim: '°C', aralik: [[30, 45]] },
  spo2: { ad: 'Oksijen satürasyonu', birim: '%', aralik: [[50, 100]] },
  kilo: { ad: 'Kilo', birim: 'kg', aralik: [[1, 400]] },
  kolesterol: { ad: 'Total kolesterol', birim: 'mg/dl', aralik: [[50, 600]] }
};

function degerlendir({ tip, deger1: a, deger2: b, aclik }) {
  const s = (seviye, metin) => ({ seviye, metin });
  switch (tip) {
    case 'tansiyon':
      if (a >= 180 || b >= 120) return s('danger', 'Çok yüksek: acil değerlendirme gerekebilir');
      if (a >= 140 || b >= 90) return s('warn', 'Yüksek');
      if (a >= 130 || b >= 85) return s('info', 'Yüksek-normal');
      if (a < 90 || b < 60) return s('warn', 'Düşük');
      return s('ok', 'Normal');
    case 'seker':
      if (a < 70) return s('danger', 'Düşük (hipoglisemi)');
      if (aclik === 'ac') return a >= 126 ? s('warn', 'Açlık şekeri yüksek') : a >= 100 ? s('info', 'Açlık şekeri sınırda') : s('ok', 'Normal');
      return a >= 200 ? s('warn', 'Tokluk şekeri yüksek') : a >= 140 ? s('info', 'Tokluk şekeri sınırda') : s('ok', 'Normal');
    case 'nabiz':
      return a > 100 ? s('warn', 'Hızlı') : a < 50 ? s('warn', 'Yavaş') : s('ok', 'Normal');
    case 'ates':
      return a >= 39 ? s('danger', 'Yüksek ateş') : a >= 38 ? s('warn', 'Ateş') : a < 35 ? s('warn', 'Düşük vücut ısısı') : s('ok', 'Normal');
    case 'spo2':
      return a < 90 ? s('danger', 'Çok düşük') : a < 95 ? s('warn', 'Düşük') : s('ok', 'Normal');
    case 'kolesterol':
      return a >= 240 ? s('warn', 'Yüksek') : a >= 200 ? s('info', 'Sınırda') : s('ok', 'İstenen düzeyde');
    default:
      return s('ok', '');
  }
}

module.exports = { TIPLER, degerlendir };
