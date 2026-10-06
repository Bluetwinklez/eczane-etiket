// Etken madde / ATC sinifina gore hazir hasta guvenligi kurallari: gebelik-emzirme, cocuk yas siniri, ileri yas (Beers).
// Urune elle girilen bayraklar (gebelik_uyari, min_yas, yasli_uyari) her zaman onceliklidir; bu tablo yoksa devreye girer.
// Sinirli ve ozet bir listedir; klinik karar destek sisteminin ve KUB'un yerini tutmaz.
const { sadelestir } = require('./ilacBilgi');

const KURALLAR = [
  // ---- Gebelik / emzirme ----
  { ad: 'İzotretinoin / asitretin (retinoidler)', atc: ['D10BA', 'D05BB'], madde: ['izotretinoin', 'isotretinoin', 'asitretin', 'acitretin'], gebelik: 'kontrendike', not: 'teratojen' },
  { ad: 'Statinler', atc: ['C10AA', 'C10BA', 'C10BX'], madde: ['atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin', 'fluvastatin', 'pitavastatin'], gebelik: 'kontrendike' },
  { ad: 'ACE inhibitörleri / ARB', atc: ['C09A', 'C09B', 'C09C', 'C09D'], madde: ['ramipril', 'enalapril', 'lisinopril', 'perindopril', 'kaptopril', 'losartan', 'valsartan', 'irbesartan', 'kandesartan', 'telmisartan', 'olmesartan'], gebelik: 'kontrendike', not: 'fetal böbrek hasarı' },
  { ad: 'Varfarin', atc: ['B01AA'], madde: ['varfarin', 'warfarin'], gebelik: 'kontrendike' },
  { ad: 'Metotreksat', atc: ['L01BA01', 'L04AX03'], madde: ['metotreksat', 'methotrexate'], gebelik: 'kontrendike' },
  { ad: 'Misoprostol', atc: ['A02BB'], madde: ['misoprostol'], gebelik: 'kontrendike' },
  { ad: 'Valproat', atc: ['N03AG01'], madde: ['valproik', 'valproat'], gebelik: 'kontrendike', not: 'nöral tüp defekti' },
  { ad: 'Tetrasiklinler', atc: ['J01AA'], madde: ['doksisiklin', 'tetrasiklin', 'minosiklin'], gebelik: 'kontrendike', minYas: 8, not: 'diş ve kemikte renk/gelişim bozukluğu' },
  { ad: 'Leflunomid / mikofenolat', atc: ['L04AA13', 'L04AA06'], madde: ['leflunomid', 'mikofenolat'], gebelik: 'kontrendike' },
  { ad: 'Finasterid / dutasterid', atc: ['G04CB'], madde: ['finasterid', 'dutasterid'], gebelik: 'kontrendike', not: 'gebeler kırık tablete dokunmamalı' },
  { ad: 'Lityum', atc: ['N05AN'], madde: ['lityum'], gebelik: 'dikkat' },
  { ad: 'Karbamazepin / fenitoin / topiramat', atc: ['N03AF01', 'N03AB02', 'N03AX11'], madde: ['karbamazepin', 'fenitoin', 'topiramat'], gebelik: 'dikkat' },
  { ad: 'NSAİİ', atc: ['M01A'], madde: ['ibuprofen', 'diklofenak', 'naproksen', 'ketoprofen', 'deksketoprofen', 'meloksikam', 'etodolak', 'flurbiprofen', 'indometazin', 'selekoksib', 'etorikoksib', 'nimesulid'], gebelik: 'dikkat', not: '3. trimesterde kontrendike', yasli: 'mide kanaması ve böbrek riski' },
  { ad: 'Kinolonlar', atc: ['J01MA'], madde: ['siprofloksasin', 'levofloksasin', 'moksifloksasin', 'ofloksasin'], gebelik: 'dikkat', minYas: 18, not: 'kıkırdak/tendon hasarı' },
  { ad: 'Kodein / tramadol', atc: ['R05DA04', 'N02AX02', 'N02AJ'], madde: ['kodein', 'tramadol'], gebelik: 'dikkat', minYas: 12, not: 'çocukta solunum depresyonu' },
  // ---- Cocuk yas siniri ----
  { ad: 'Asetilsalisilik asit (aspirin)', atc: ['N02BA01', 'B01AC06'], madde: ['asetilsalisilik', 'aspirin'], minYas: 16, gebelik: 'dikkat', not: 'Reye sendromu riski; gebelikte 3. trimesterde kaçınılır' },
  { ad: 'Metoklopramid', atc: ['A03FA01'], madde: ['metoklopramid'], minYas: 1, yasli: 'ekstrapiramidal yan etki, tardif diskinezi' },
  { ad: 'Loperamid', atc: ['A07DA03'], madde: ['loperamid'], minYas: 2 },
  { ad: 'Prometazin', atc: ['R06AD02'], madde: ['prometazin'], minYas: 2, yasli: 'güçlü antikolinerjik, sedasyon' },
  // ---- Ileri yas (Beers listesi ozeti) ----
  { ad: 'Benzodiazepinler', atc: ['N05BA', 'N05CD'], madde: ['alprazolam', 'diazepam', 'lorazepam', 'klonazepam', 'midazolam', 'klordiazepoksit'], yasli: 'düşme, kırık ve bilişsel bozulma riski', gebelik: 'dikkat' },
  { ad: 'Z-ilaçlar (zolpidem vb.)', atc: ['N05CF'], madde: ['zolpidem', 'zopiklon', 'eszopiklon'], yasli: 'düşme ve kırık riski' },
  { ad: '1. kuşak antihistaminikler', atc: ['R06AA', 'R06AB', 'R06AE03'], madde: ['difenhidramin', 'klorfeniramin', 'hidroksizin', 'dimenhidrinat', 'siproheptadin'], yasli: 'antikolinerjik: konfüzyon, idrar retansiyonu' },
  { ad: 'Trisiklik antidepresanlar', atc: ['N06AA'], madde: ['amitriptilin', 'imipramin', 'klomipramin', 'doksepin'], yasli: 'antikolinerjik ve ortostatik hipotansiyon' },
  { ad: 'Mesane antikolinerjikleri', atc: ['G04BD'], madde: ['oksibutinin', 'tolterodin', 'solifenasin', 'trospiyum'], yasli: 'konfüzyon, kabızlık' },
  { ad: 'Kas gevşeticiler', atc: ['M03BX', 'M03BA'], madde: ['tiyokolşikosid', 'siklobenzaprin', 'metokarbamol', 'karisoprodol'], yasli: 'sedasyon ve düşme riski' },
  { ad: 'Uzun etkili sülfonilüreler', atc: ['A10BB01', 'A10BB12'], madde: ['glibenklamid', 'glimepirid'], yasli: 'uzamış hipoglisemi' },
  { ad: 'Digoksin', atc: ['C01AA05'], madde: ['digoksin'], yasli: 'toksisite; günlük 0,125 mg üstünden kaçının' },
  { ad: 'Proton pompası inhibitörleri', atc: ['A02BC'], madde: ['omeprazol', 'esomeprazol', 'lansoprazol', 'pantoprazol', 'rabeprazol'], yasli: '8 haftadan uzun kullanımda kırık ve C. difficile riski', seviye: 'hafif' }
];

// Cocuklarda kiloya gore dozu kontrol edilmesi gereken yaygin etken maddeler (Hesaplamalar sayfasinda on ayari var)
const KILO_DOZLU = ['parasetamol', 'ibuprofen', 'amoksisilin'];

const sade = (m) => sadelestir(m).replace(/[^a-z0-9 ]/g, ' ');

function kurallariBul(urun) {
  const atc = String(urun.atc_kodu || '').toUpperCase();
  const madde = sade(urun.etken_madde);
  return KURALLAR.filter((k) => (atc && k.atc.some((on) => atc.startsWith(on))) || (madde && k.madde.some((m) => madde.includes(m))));
}

// musteri: { yas, durum ('gebe'|'emziren'|null), kilo }; urun: { ad, atc_kodu, etken_madde, gebelik_uyari, min_yas, yasli_uyari }
function kuralUyarilari(musteri, urun, yasliEsigi = 65) {
  const sonuc = [];
  const kurallar = kurallariBul(urun);
  const { yas, durum, kilo } = musteri;
  if (durum && !urun.gebelik_uyari) {
    const k = kurallar.find((x) => x.gebelik === 'kontrendike') || kurallar.find((x) => x.gebelik === 'dikkat');
    if (k) {
      sonuc.push({
        tur: 'gebelik',
        seviye: k.gebelik === 'kontrendike' ? 'ciddi' : 'orta',
        urun: urun.ad,
        kaynak: 'kural',
        mesaj: `Müşteri ${durum}; ${k.ad} gebelik/emzirme döneminde ${k.gebelik === 'kontrendike' ? 'kontrendike' : 'dikkatle kullanılmalı'}${k.not ? ` (${k.not})` : ''}.`
      });
    }
  }
  if (yas !== null && !urun.min_yas) {
    const k = kurallar.filter((x) => x.minYas && yas < x.minYas).sort((a, b) => b.minYas - a.minYas)[0];
    if (k) sonuc.push({ tur: 'yas', seviye: 'ciddi', urun: urun.ad, kaynak: 'kural', mesaj: `Müşteri ${yas} yaşında; ${k.ad} ${k.minYas} yaş altında önerilmez${k.not ? ` (${k.not})` : ''}.` });
  }
  if (yas !== null && yas >= yasliEsigi && !urun.yasli_uyari) {
    const k = kurallar.find((x) => x.yasli);
    if (k) sonuc.push({ tur: 'yasli', seviye: k.seviye || 'orta', urun: urun.ad, kaynak: 'kural', mesaj: `Müşteri ${yas} yaşında; ${k.ad}: ${k.yasli} (Beers).` });
  }
  if (yas !== null && yas < 12) {
    const madde = sade(urun.etken_madde);
    const m = KILO_DOZLU.find((x) => madde.includes(x));
    if (m) {
      sonuc.push({
        tur: 'doz',
        seviye: 'hafif',
        urun: urun.ad,
        kaynak: 'kural',
        mesaj: kilo ? `Çocuk (${yas} yaş, son ölçüm ${kilo} kg): ${m} dozunu kiloya göre Hesaplamalar sayfasında kontrol edin.` : `Çocuk (${yas} yaş): ${m} dozu kiloya göredir; kilosunu sorup Hesaplamalar sayfasında kontrol edin.`
      });
    }
  }
  return sonuc;
}

module.exports = { KURALLAR, kurallariBul, kuralUyarilari };
