// Satis saatleri DB'de UTC tutulur. Saat bazli analiz ve ay sinirlari icin
// yerel saat farki kullanilir (Turkiye UTC+3, yaz saati uygulanmiyor).
function saatFarki() {
  const n = Number(process.env.ECZANEM_SAAT_FARKI ?? 3);
  return Number.isInteger(n) && n >= -12 && n <= 14 ? n : 3;
}

// SQLite tarih fonksiyonlarina verilecek degistirici, orn. '+3 hours'
function sqlSaatFarki() {
  const n = saatFarki();
  return `${n >= 0 ? '+' : ''}${n} hours`;
}

function yerelSimdi() {
  return new Date(Date.now() + saatFarki() * 3600000);
}

module.exports = { saatFarki, sqlSaatFarki, yerelSimdi };
