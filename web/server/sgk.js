// SGK SUT ilac listeleri: EK-4/A (bedeli odenecek ilaclar), EK-4/D (katilim payindan muaf ilaclar ve ICD-10 kodlari),
// EK-4/E (antibiyotik vb. receteleme kurallari), EK-4/F (saglik raporu ile verilebilecek ilaclar).
// SGK'nin "Guncel 2013 SUT" zip dosyasi ya da listelerin tek tek dosyalari kabul edilir. Bagimlilik yok.
const { xlsxOku, zipDosyalari, dosyaOku, dosyaOkuIkili } = require('./xlsxOku');
const { wordMetni } = require('./wordOku');
const { sadelestir } = require('./ilacBilgi');

const ZIP = 0x04034b50;
const OLE = 0xe011cfd0;

function hata(m) {
  const e = new Error(m);
  e.kullaniciHatasi = true;
  return e;
}

// Eslestirme anahtari: Turkce/Latince yazim farklarini yumusatir ("Digoxin" = "Digoksin", "Methotrexat" = "Metotreksat").
function fonetik(m) {
  return sadelestir(m)
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/x/g, 'ks').replace(/c/g, 'k').replace(/y/g, 'i')
    .replace(/z/g, 's').replace(/w/g, 'v').replace(/q/g, 'k')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- EK-4/A (xlsx) ----
function excelTarih(d) {
  const s = String(d == null ? '' : d).trim();
  if (!s) return null;
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return t.toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
const oran = (v) => {
  const s = String(v == null ? '' : v).trim().replace('%', '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((n > 1 ? n : n * 100) * 100) / 100;
};
const tlSayi = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

function ek4aCoz(tampon) {
  const sayfalar = xlsxOku(tampon);
  for (const sayfa of sayfalar) {
    const satirlar = sayfa.satirlar;
    const sade = (h) => sadelestir(String(h || '').replace(/\s+/g, ' '));
    const bi = satirlar.findIndex((r) => r.some((h) => /guncel barkod/.test(sade(h))) && r.some((h) => /kamu no/.test(sade(h))));
    if (bi < 0) continue;
    const baslik = satirlar[bi].map((h) => String(h || '').replace(/\s+/g, ' ').trim());
    const bul = (desen) => baslik.findIndex((h) => desen.test(sade(h)));
    const s = {
      kamu: bul(/^kamu no/), barkod: bul(/guncel barkod/), ad: bul(/ilac adi/),
      esdeger: bul(/esdeger/), referans: bul(/terapotik/), giris: bul(/listeye giris/), aktif: bul(/aktiflenme/),
      pasif: bul(/pasiflenme/), durum: bul(/indirim oranlarina esas/), ozel: bul(/ozel iskonto/), eczaci: bul(/eczaci iskonto/)
    };
    if (s.barkod < 0 || s.ad < 0) continue;
    const eski = baslik.map((h, i) => (/eski barkod/.test(sade(h)) ? i : -1)).filter((i) => i >= 0);
    // Depocuya satis fiyati bantlari: basliktaki TL sinirlarindan okunur (SGK zaman zaman gunceller)
    const bantlar = baslik
      .map((h, i) => ({ h, i }))
      .filter((x) => /depocuya satis/.test(sade(x.h)))
      .map(({ h, i }) => {
        const sayilar = [...h.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL/g)].map((m) => tlSayi(m[1]));
        if (/uzeri/.test(sade(h))) return { i, alt: sayilar[0], ust: null, etiket: `${h.match(/(\d[\d.,]*) TL/)[0]} ve üzeri` };
        if (/altinda/.test(sade(h))) return { i, alt: null, ust: sayilar[0], etiket: `${h.match(/(\d[\d.,]*) TL/)[0]} ve altı` };
        return { i, alt: sayilar[0], ust: sayilar[1], etiket: sayilar.length === 2 ? `${h.match(/(\d[\d.,]*) TL/g).join(' – ')}` : h };
      });
    const kayitlar = [];
    const gorulen = new Set();
    for (const r of satirlar.slice(bi + 1)) {
      const barkod = String(r[s.barkod] || '').replace(/\D/g, '');
      if (!/^\d{8,14}$/.test(barkod) || gorulen.has(barkod)) continue;
      gorulen.add(barkod);
      const al = (i) => (i >= 0 ? String(r[i] == null ? '' : r[i]).replace(/\s+/g, ' ').trim() : '');
      kayitlar.push({
        barkod,
        kamu_no: al(s.kamu) || null,
        ad: al(s.ad),
        eski_barkodlar: eski.map(al).join(' ').split(/[\s,;]+/).filter((b) => /^\d{8,14}$/.test(b)).join(',') || null,
        esdeger_grup: al(s.esdeger) || null,
        referans_grup: al(s.referans) || null,
        giris_tarihi: excelTarih(al(s.giris)),
        aktif_tarihi: excelTarih(al(s.aktif)),
        pasif_tarihi: excelTarih(al(s.pasif)),
        durum: al(s.durum) || null,
        iskontolar: bantlar.map((b) => oran(r[b.i])),
        ozel_iskonto: al(s.ozel) || null,
        eczaci_iskonto: al(s.eczaci) || null
      });
    }
    if (kayitlar.length) return { kayitlar, bantlar: bantlar.map(({ alt, ust, etiket }) => ({ alt, ust, etiket })) };
  }
  throw hata('EK-4/A listesi tanınmadı (Kamu No / Güncel Barkod sütunları bulunamadı)');
}

// ---- EK-4/D (Word .doc) ----
const ICD = /^([A-Z])\s?(\d{2})(?:\.(\d{1,2}))?\s*[†*+]*$/;
const icdNorm = (k) => {
  const m = String(k || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z])(\d{2})(?:\.(\d{1,2}))?/);
  return m ? `${m[1]}${m[2]}${m[3] ? '.' + m[3] : ''}` : null;
};
const NOT_SATIRI = /^\(?\s*(ek|değişik|mülga|iptal)\s*:/i;

function ek4dCoz(metin) {
  const satirlar = metin.split('\r');
  const ogeler = [];
  for (const ham of satirlar) {
    if (ham.includes('\x07')) {
      const hucreler = ham.split('\x07').map((h) => h.replace(/\s+/g, ' ').trim());
      const kodlar = [];
      for (let i = 0; i < hucreler.length; i++) {
        const m = hucreler[i].match(ICD);
        if (!m) continue;
        const kod = `${m[1]}${m[2]}${m[3] ? '.' + m[3] : ''}`;
        const ad = hucreler[i + 1] && !ICD.test(hucreler[i + 1]) ? hucreler[i + 1] : '';
        kodlar.push({ kod, ad });
      }
      ogeler.push({ tablo: kodlar });
      continue;
    }
    const t = ham.replace(/[\t\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    ogeler.push({ metin: t });
  }
  const anlamsiz = (o) => o.metin && (NOT_SATIRI.test(o.metin) || /^[A-Z0-9.\s]+$/.test(o.metin));
  const tabloGeliyor = (i) => {
    for (let j = i + 1; j < ogeler.length && j <= i + 4; j++) {
      if (ogeler[j].tablo) return ogeler[j].tablo.length > 0;
      if (!anlamsiz(ogeler[j])) return false;
    }
    return false;
  };

  const numaraAyir = (t) => {
    const m = t.match(/^(\d+(?:\.\d+)*)\.?\s+(.*)$/) || t.match(/^(\d+(?:\.\d+)+)\.?(\S.*)$/);
    return { no: m ? m[1] : null, govde: (m ? m[2] : t).trim() };
  };
  // Siradaki anlamli satir yeni bir hastalik grubu basligi mi? (alt baslik / kategori satirlarini ayirt etmek icin)
  const sonrakiGrup = (i) => {
    for (let j = i + 1; j < ogeler.length && j <= i + 4; j++) {
      if (ogeler[j].tablo) return null;
      if (anlamsiz(ogeler[j])) continue;
      return tabloGeliyor(j) ? numaraAyir(ogeler[j].metin) : null;
    }
    return null;
  };

  const gruplar = [];
  const ortaklar = [];
  let ana = null;
  let grup = null;
  let notlar = false;
  for (let i = 0; i < ogeler.length; i++) {
    const o = ogeler[i];
    if (o.tablo) {
      if (grup) for (const k of o.tablo) if (!grup.icd.some((x) => x.kod === k.kod)) grup.icd.push(k);
      continue;
    }
    const t = o.metin;
    if (/^NOT:?$/i.test(t)) { notlar = true; grup = null; continue; }
    if (notlar || anlamsiz(o) || /EK-4\/D\)?\s*$/i.test(t)) continue;
    const { no, govde } = numaraAyir(t);
    if (!govde) continue;
    if (tabloGeliyor(i)) {
      // Ayni bolum numarasini tasiyan alt baslik (Word otomatik numarasi kaybolmus) ana bolumu degistirmez
      if (no && !no.includes('.') && (!ana || ana.kod !== no)) ana = { kod: no, baslik: govde };
      const baslik = govde.replace(/\)\s*[A-Z0-9 ]+$/, ')').replace(/^\d+\.\s+/, '').trim();
      grup = { kod: no, anaKod: ana ? ana.kod : null, ana: ana ? ana.baslik : null, baslik, araliklar: araliklar(baslik), icd: [], ilaclar: [] };
      gruplar.push(grup);
      continue;
    }
    if (no && !no.includes('.') && (!ana || ana.kod !== no)) {
      ana = { kod: no, baslik: govde };
      grup = null;
      continue;
    }
    // Kategori basligi: "8.1.2 Hemolitik anemiler" ardindan "8.1.2.1 ..." grubu; numarasiz ise ardindan "x.y.1" gelir
    const sonraki = sonrakiGrup(i);
    if (sonraki && sonraki.no && ((no && sonraki.no.startsWith(no + '.')) || (!no && /^\d+\.\d+\.1$/.test(sonraki.no)))) {
      grup = null;
      continue;
    }
    // "8.2 Yalnızca bu hastalıkların tedavisine yönelik kullanılan ilaçlar": bolumdeki tum hastaliklar icin ortak liste
    if (no && no.split('.').length === 2 && ana && (!grup || !grup.kod || grup.kod.includes('.'))) {
      grup = { ortak: true, anaKod: ana.kod, baslik: govde, ilaclar: [] };
      ortaklar.push(grup);
      continue;
    }
    if (!grup || govde.length > 400) continue;
    const madde = ilacMaddesi(no, govde);
    if (!madde.ad) continue;
    const k = fonetik(madde.ad);
    const eski = grup.ilaclar.findIndex((x) => fonetik(x.ad) === k);
    if (eski >= 0) grup.ilaclar.splice(eski, 1);
    grup.ilaclar.push(madde);
  }
  for (const g of gruplar) {
    g.ana = g.ana || g.baslik;
    const ortak = ortaklar.find((o) => o.anaKod === g.anaKod && o.ilaclar.length);
    if (!g.ilaclar.length && ortak) {
      g.ilaclar = ortak.ilaclar.map((x) => ({ ...x }));
      g.ortak_not = ortak.baslik;
    }
    delete g.anaKod;
  }
  return gruplar.filter((g) => g.icd.length || g.araliklar.length);
}

// "(I10 -I13) (I15) (Z95.5-Z95.9)" → [{bas:'I10', son:'I13'}, ...]
function araliklar(baslik) {
  const sonuc = [];
  for (const p of baslik.matchAll(/\(([^()]*)\)/g)) {
    for (const parca of p[1].split(/[,;]/)) {
      const m = parca.toUpperCase().replace(/[†*\s]/g, '').match(/^([A-Z]\d{2}(?:\.\d{1,2})?)(?:-+([A-Z]\d{2}(?:\.\d{1,2})?))?$/);
      if (m) sonuc.push({ bas: m[1], son: m[2] || m[1] });
    }
  }
  return sonuc;
}

function ilacMaddesi(no, govde) {
  const temiz = govde
    .replace(/^(\(\s*(ek|değişik|mülga|iptal)\s*:[^)]*\)\s*)+/i, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^[-–•]\s*/, '')
    .trim();
  const yildiz = /\*/.test(temiz);
  const ilkParantez = temiz.indexOf('(');
  const ad = (ilkParantez > 2 ? temiz.slice(0, ilkParantez) : temiz).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  const kosul = ilkParantez > 2 ? temiz.slice(ilkParantez).replace(/\s+/g, ' ').trim() : null;
  return { no, ad: /^\(/.test(ad) ? '' : ad, endikasyon: yildiz, kosul };
}

// Bir ICD kodunun grubu kapsayip kapsamadigi (EK-4/D NOT 3: ana kod yazilmissa alt kodlar dahildir)
function icdKiyas(a, b) {
  return a.localeCompare(b, 'en', { numeric: true });
}
function icdKapsar(grup, kod) {
  const k = icdNorm(kod);
  if (!k) return false;
  const anaKod = k.slice(0, 3);
  if (grup.icd.some((x) => x.kod === k || (!x.kod.includes('.') && x.kod === anaKod))) return true;
  return grup.araliklar.some(({ bas, son }) => {
    const deger = bas.includes('.') || son.includes('.') ? k : anaKod;
    return icdKiyas(deger, bas) >= 0 && icdKiyas(deger, son.includes('.') ? son : son) <= 0;
  });
}

// ---- EK-4/E (docx) ve EK-4/F (doc) ----
const xmlCoz = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function docxSatirlari(tampon) {
  const dosyalar = zipDosyalari(tampon);
  const xml = dosyaOku(tampon, dosyalar, 'word/document.xml');
  if (!xml) throw hata('Word (.docx) belgesi okunamadı');
  const metin = (p) => xmlCoz([...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).replace(/\s+/g, ' ').trim();
  const tablolar = xml.split(/<\/w:tr>/).slice(0, -1).map((r) => r.split(/<\/w:tc>/).slice(0, -1).map(metin));
  const paragraflar = xml.split(/<\/w:p>/).map(metin).filter(Boolean);
  return { tablolar, paragraflar };
}

function ek4eCoz(tampon) {
  const { tablolar, paragraflar } = docxSatirlari(tampon);
  const kurallar = [];
  let grup = null;
  for (const r of tablolar) {
    const dolu = r.filter(Boolean);
    if (dolu.length === 1 && /^(\d+-|[A-Z]\))/.test(dolu[0]) && dolu[0].length < 120) { grup = dolu[0]; continue; }
    if (r.length < 3 || !/^\d+(\.\d+)?/.test(r[0]) || !r[1]) continue;
    const mulga = /mülga/i.test(r[0]) && !/değişik|ek:/i.test(r[0].replace(/.*mülga/i, ''));
    kurallar.push({ grup, no: r[0].match(/^\d+(\.\d+)?/)[0], baslik: r[1], metin: r.slice(2).filter(Boolean).join(' '), mulga });
  }
  const ai = paragraflar.map((p, i) => (/^AÇIKLAMALAR/i.test(p) ? i : -1)).filter((i) => i >= 0).pop();
  const aciklama = ai != null ? paragraflar.slice(ai).join('\n') : null;
  if (!kurallar.length) throw hata('EK-4/E listesi tanınmadı');
  return { kurallar: kurallar.filter((k) => !k.mulga), aciklama };
}

function ek4fCoz(metin) {
  const maddeler = [];
  let not = false;
  for (const ham of metin.split('\r')) {
    const t = ham.replace(/\x07/g, ' ').replace(/[\t\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 3) continue;
    if (/^NOT:?$/i.test(t)) { not = true; continue; }
    if (not || /^EK-4\/F$/i.test(t) || /İLE VERİLEBİLECEK İLAÇLAR LİSTESİ/i.test(t)) continue;
    if (/^\(?\s*(ek|değişik|mülga|iptal)\s*:[^)]*\)\s*$/i.test(t)) continue;
    // Numarali alt maddeler (6. ..., a) ...) bir onceki maddenin devami sayilir
    if (maddeler.length && (/^(\d+(\.\d+)*\.|[a-zçğıöşü]\))\s/i.test(t) || /^[a-zçğıöşü]/.test(t))) {
      maddeler[maddeler.length - 1].metin += '\n' + t;
      continue;
    }
    maddeler.push({ metin: t.replace(/^\(\s*(Ek|Değişik)\s*:[^)]*\)\s*/i, '') });
  }
  if (maddeler.length < 5) throw hata('EK-4/F listesi tanınmadı');
  return maddeler.map((m) => ({ baslik: m.metin.split(/[(\n]/)[0].trim().slice(0, 160), metin: m.metin }));
}

// ---- Dosya turu tespiti ----
function tekDosyaCoz(tampon, ad = '') {
  if (tampon.length < 8) throw hata('Dosya boş');
  const imza = tampon.readUInt32LE(0);
  const sonuc = {};
  if (imza === OLE) {
    const metin = wordMetni(tampon);
    const bas = metin.slice(0, 3000);
    if (/EK-4\/D|KATILIM PAYINDAN MUAF/i.test(bas) || /EK-4D/i.test(ad)) sonuc.ek4d = ek4dCoz(metin);
    else if (/EK-4\/F|SAĞLIK RAPORU.*İLE VERİLEBİLECEK/i.test(bas) || /EK-4F/i.test(ad)) sonuc.ek4f = ek4fCoz(metin);
    else throw hata('Word belgesi EK-4/D veya EK-4/F listesi değil');
    return sonuc;
  }
  if (imza !== ZIP) throw hata('Dosya türü tanınmadı: SUT zip, EK-4A (.xlsx), EK-4D/EK-4F (.doc) veya EK-4E (.docx) yükleyin');
  const dosyalar = zipDosyalari(tampon);
  if (dosyalar.has('word/document.xml')) {
    sonuc.ek4e = ek4eCoz(tampon);
    return sonuc;
  }
  if (dosyalar.has('xl/workbook.xml')) {
    sonuc.ek4a = ek4aCoz(tampon);
    return sonuc;
  }
  // SGK "Guncel 2013 SUT" paketi: icindeki guncel EK-4 listeleri (MULGA klasoru haric)
  const adlar = [...dosyalar.keys()].filter((a) => !/m[üu]lga/i.test(a) && !a.endsWith('/'));
  const sec = (desen) => adlar.find((a) => desen.test(a.split('/').pop()));
  const hedefler = [
    ['ek4a', sec(/^EK-4A\b.*\.xlsx$/i), (b) => ek4aCoz(b)],
    ['ek4d', sec(/^EK-4D\b.*\.doc$/i), (b) => ek4dCoz(wordMetni(b))],
    ['ek4e', sec(/^EK-4E\b.*\.docx$/i), (b) => ek4eCoz(b)],
    ['ek4f', sec(/^EK-4F\b.*\.doc$/i), (b) => ek4fCoz(wordMetni(b))]
  ];
  for (const [anahtar, dosyaAdi, coz] of hedefler) {
    if (!dosyaAdi) continue;
    sonuc[anahtar] = coz(dosyaOkuIkili(tampon, dosyalar, dosyaAdi));
  }
  if (!Object.keys(sonuc).length) throw hata('Zip içinde EK-4 listesi bulunamadı');
  const klasor = adlar[0] ? adlar[0].split('/')[0] : '';
  const tarih = klasor.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (tarih) sonuc.liste_tarihi = `${tarih[1]}-${tarih[2]}-${tarih[3]}`;
  return sonuc;
}

// ---- Sinif adi → ATC on eki (EK-4/D'de ilaclar cogu zaman grup adiyla yazilir) ----
const SINIF_ATC = [
  [/anjiotensin d[oö]n[uü]şt[uü]r[uü]c[uü]|ace inh/i, ['C09A', 'C09B']],
  [/anjiotensin resept[oö]r|anjiyotensin resept[oö]r/i, ['C09C', 'C09D']],
  [/beta.?bloker|beta adrenerjik resept[oö]r bloker/i, ['C07']],
  [/alfa.?beta resept[oö]r/i, ['C07AG']],
  [/kalsiyum (kanal bloker|antagonist)/i, ['C08']],
  [/di[uü]retik/i, ['C03']],
  [/nitrat/i, ['C01DA']],
  [/antiagregan/i, ['B01AC']],
  [/antikoag[uü]lan/i, ['B01AA', 'B01AB', 'B01AE', 'B01AF']],
  [/kolesterol|lipid d[uü]ş[uü]r[uü]c[uü]/i, ['C10']],
  [/antiaritmik/i, ['C01B']],
  [/insulin|ins[uü]lin/i, ['A10A']],
  [/oral antidiyabetik|oral antidiabetik/i, ['A10B']],
  [/antiepileptik/i, ['N03']],
  [/antipsikotik|n[oö]roleptik/i, ['N05A']],
  [/antidepresan/i, ['N06A']],
  [/anksiyolitik/i, ['N05B']],
  [/antiparkinson/i, ['N04']],
  [/bronkodilat|beta 2 agonist/i, ['R03']],
  [/inhaler kortikosteroid|inhale kortikosteroid/i, ['R03BA']],
  [/kortikosteroid/i, ['H02']],
  [/imm[uü]n ?s[uü]pres/i, ['L04']],
  [/antineoplastik|sitostatik/i, ['L01']],
  [/antiviral/i, ['J05']],
  [/mukolitik/i, ['R05CB']],
  [/ekspektoran/i, ['R05CA']],
  [/antiemetik/i, ['A04']],
  [/analjezik/i, ['N02']],
  [/tiroid hormon/i, ['H03A']],
  [/antitiroid/i, ['H03B']],
  [/demir preparat|demir/i, ['B03A']],
  [/folik asit/i, ['B03BB']],
  [/b12|siyanokobalamin/i, ['B03BA']],
  [/eritropoietin|eritropoetin/i, ['B03XA']],
  [/bifosfonat|bisfosfonat/i, ['M05BA', 'M05BB']],
  [/proton pompa/i, ['A02BC']],
  [/h2 resept[oö]r/i, ['A02BA']],
  [/pankreas enzim/i, ['A09AA']],
  [/antiglokom|glokom/i, ['S01E']],
  [/antihistamin/i, ['R06']],
  [/d vitamini|vitamin d/i, ['A11CC']],
  [/kalsiyum preparat/i, ['A12AA']],
  [/antimalaryal|antimalarial/i, ['P01B']],
  [/nonsteroid antiinflamatuvar|nsaii|nsai/i, ['M01A']],
  [/gonadotropin/i, ['G03G']],
  [/b[uü]y[uü]me hormonu/i, ['H01AC']],
  [/kolinesteraz inhibit/i, ['N06DA']],
  [/antikolinerjik/i, ['N04A']]
];
function sinifAtc(ad) {
  for (const [desen, atc] of SINIF_ATC) if (desen.test(ad)) return atc;
  return [];
}

// Bir ilac maddesi (EK-4/D satiri) verilen ilacla eslesiyor mu?
function maddeEslesir(maddeAdi, { anahtarlar, atc }) {
  const f = fonetik(maddeAdi).replace(/ /g, '');
  const ana = anahtarlar.map((a) => a.replace(/ /g, ''));
  if (ana.some((a) => a.length >= 5 && (f.includes(a) || (a.includes(f) && f.length >= 6)))) return 'etken';
  if (atc && sinifAtc(maddeAdi).some((on) => atc.startsWith(on))) return 'sinif';
  return null;
}

// Etken madde metninden eslestirme anahtarlari ("PARASETAMOL 500 MG + KAFEIN" → ['parasetamol', 'kafein'])
function etkenAnahtarlari(...kaynaklar) {
  const set = new Set();
  for (const k of kaynaklar) {
    for (const parca of String(k || '').split(/[+,/;]| ve /i)) {
      const temiz = fonetik(parca.replace(/\d[\d.,]*\s*(mg|mcg|µg|g|ml|iu|ui|%)?/gi, ' '))
        .replace(/\b(hidroklorur|hcl|sodyum|potasyum|kalsiyum|magnezyum|maleat|besilat|tartarat|suksinat|fumarat|mesilat|sitrat|asetat|dihidrat|monohidrat|trihidrat|hidrat|bromur|sulfat|fosfat|tablet|film|kapsul|surup|ampul|flakon|krem|merhem|damla|sprei|mg|ml)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (temiz.length >= 4) set.add(temiz);
      // Coklu kelimede ilk anlamli kelime de anahtar olur ("asetilsalisilik asit" → "asetilsalisilik")
      const ilk = temiz.split(' ')[0];
      if (ilk && ilk.length >= 6) set.add(ilk);
    }
  }
  return [...set];
}

module.exports = {
  ek4aCoz, ek4dCoz, ek4eCoz, ek4fCoz, tekDosyaCoz, icdKapsar, icdNorm, araliklar, fonetik, sinifAtc, maddeEslesir, etkenAnahtarlari, excelTarih
};
