const URUN_TIPLERI = {
  ilac: 'İlaç',
  dermokozmetik: 'Dermokozmetik',
  takviye: 'Gıda Takviyesi',
  medikal: 'Medikal Ürün',
  diger: 'Diğer'
};

const RECETE_TURLERI = {
  beyaz: 'Beyaz (normal)',
  kirmizi: 'Kirmizi (narkotik)',
  yesil: 'Yesil (psikotrop)',
  mor: 'Mor',
  turuncu: 'Turuncu'
};
// Bu turlerdeki ilaclar icin kontrollu ilac defteri tutulur
const KONTROLLU_TURLER = ['kirmizi', 'yesil'];

module.exports = { URUN_TIPLERI, RECETE_TURLERI, KONTROLLU_TURLER };
