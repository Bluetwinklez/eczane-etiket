// UBL-TR e-fatura / e-arsiv (XML) ayristirici: depo faturasini mal kabul satirlarina cevirir.
// Disaridan paket kullanilmaz. DOCTYPE/varlik tanimi iceren belgeler reddedilir (XXE'ye karsi).
const { zipDosyalari, dosyaOku } = require('./xlsxOku');

const VARLIK = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const coz = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, v) =>
    v[0] === '#' ? String.fromCodePoint(v[1] === 'x' || v[1] === 'X' ? parseInt(v.slice(2), 16) : Number(v.slice(1))) : VARLIK[v.toLowerCase()]
  );
const yerelAd = (ad) => ad.slice(ad.indexOf(':') + 1);

function xmlAgac(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCTYPE içeren XML kabul edilmez');
  const kok = { ad: '#kok', nitelik: {}, cocuk: [], metin: '' };
  const yigin = [kok];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.\-:]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const ust = yigin[yigin.length - 1];
    if (m[1] !== undefined) ust.metin += m[1];
    else if (m[6] !== undefined) ust.metin += coz(m[6]);
    else if (m[3]) {
      if (m[2]) {
        if (yigin.length > 1) yigin.pop();
        continue;
      }
      const dugum = { ad: yerelAd(m[3]), nitelik: {}, cocuk: [], metin: '' };
      for (const a of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) dugum.nitelik[yerelAd(a[1])] = coz(a[2] ?? a[3]);
      ust.cocuk.push(dugum);
      if (!m[5]) yigin.push(dugum);
    }
  }
  return kok;
}

const cocuklar = (d, ad) => (d ? d.cocuk.filter((c) => c.ad === ad) : []);
function yol(d, ...adlar) {
  let x = d;
  for (const a of adlar) {
    x = cocuklar(x, a)[0];
    if (!x) return null;
  }
  return x;
}
const metin = (d) => (d ? d.metin.trim() : '');
const sayi = (d) => {
  const n = Number(metin(d));
  return Number.isFinite(n) ? n : 0;
};
function ilkBul(d, ad) {
  if (!d) return null;
  if (d.ad === ad) return d;
  for (const c of d.cocuk) {
    const b = ilkBul(c, ad);
    if (b) return b;
  }
  return null;
}
const y2 = (n) => Math.round(n * 100) / 100;

function barkodBul(item, ad) {
  const kimlikler = ['StandardItemIdentification', 'ManufacturersItemIdentification', 'SellersItemIdentification', 'BuyersItemIdentification']
    .map((k) => metin(yol(item, k, 'ID')).replace(/\s/g, ''))
    .filter(Boolean);
  const gtin = kimlikler.find((k) => /^\d{8,14}$/.test(k));
  if (gtin) return gtin;
  const adda = String(ad).match(/\b(86\d{11}|\d{13})\b/);
  return adda ? adda[1] : null;
}

function mfBul(satir, ad) {
  const notlar = cocuklar(satir, 'Note').map(metin).join(' ') + ' ' + ad;
  const m = notlar.match(/\bMF\s*[:=]?\s*(\d+)\b/i) || notlar.match(/\b\d+\s*\+\s*(\d+)\b/);
  return m ? Number(m[1]) : 0;
}

// XML metninden fatura ozeti + satirlar
function faturaCoz(xml) {
  const agac = xmlAgac(xml);
  const f = ilkBul(agac, 'Invoice');
  if (!f) throw new Error('Dosyada UBL e-fatura (Invoice) bulunamadı');
  const tedarikciParti = yol(f, 'AccountingSupplierParty', 'Party');
  const kimlikler = cocuklar(tedarikciParti, 'PartyIdentification').map((p) => yol(p, 'ID')).filter(Boolean);
  const vknDugum = kimlikler.find((k) => /^(VKN|TCKN)$/i.test(k.nitelik.schemeID || '')) || kimlikler[0];
  const kisi = yol(tedarikciParti, 'Person');
  const tedarikciAd = metin(yol(tedarikciParti, 'PartyName', 'Name')) || [metin(yol(kisi, 'FirstName')), metin(yol(kisi, 'FamilyName'))].filter(Boolean).join(' ');

  const hamSatirlar = cocuklar(f, 'InvoiceLine').map((s, i) => {
    const item = yol(s, 'Item');
    const ad = metin(yol(item, 'Name')) || metin(yol(item, 'Description')) || `Satır ${i + 1}`;
    const miktar = sayi(yol(s, 'InvoicedQuantity'));
    const tutar = sayi(yol(s, 'LineExtensionAmount')); // KDV haric, iskonto dusulmus
    const vergi = sayi(yol(s, 'TaxTotal', 'TaxAmount'));
    const oran = sayi(yol(s, 'TaxTotal', 'TaxSubtotal', 'Percent'));
    const iskonto = cocuklar(s, 'AllowanceCharge').filter((a) => metin(yol(a, 'ChargeIndicator')) === 'false').reduce((t, a) => t + sayi(yol(a, 'Amount')), 0);
    const lot = yol(item, 'ItemInstance', 'LotIdentification');
    return {
      satir: i + 1,
      ad,
      barkod: barkodBul(item, ad),
      adet: miktar,
      birim: (yol(s, 'InvoicedQuantity') || { nitelik: {} }).nitelik.unitCode || null,
      liste_fiyati: sayi(yol(s, 'Price', 'PriceAmount')),
      iskonto: y2(iskonto),
      tutar: y2(tutar),
      kdv_orani: oran,
      kdv_tutari: y2(vergi),
      birim_fiyat_kdv_haric: miktar ? y2(tutar / miktar) : 0,
      birim_fiyat_kdv_dahil: miktar ? y2((tutar + vergi) / miktar) : 0,
      mf: mfBul(s, ad),
      parti_no: metin(yol(lot, 'LotNumberID')) || null,
      skt: (metin(yol(lot, 'ExpiryDate')) || '').slice(0, 10) || null
    };
  });

  // Bedelsiz satir (tutari 0) ayni barkodlu ucretli satira mal fazlasi olarak eklenir
  const satirlar = [];
  for (const s of hamSatirlar) {
    const ucretli = s.tutar <= 0 && s.barkod && satirlar.find((x) => x.barkod === s.barkod && x.tutar > 0);
    if (ucretli) {
      ucretli.mf += s.adet;
      ucretli.birlesen_bedelsiz = (ucretli.birlesen_bedelsiz || 0) + 1;
    } else satirlar.push({ ...s });
  }

  const toplam = yol(f, 'LegalMonetaryTotal');
  const odenecek = sayi(yol(toplam, 'PayableAmount'));
  const uyarilar = [];
  const tip = metin(yol(f, 'InvoiceTypeCode')).toUpperCase();
  if (tip === 'IADE') uyarilar.push('Bu bir iade faturası; mal kabul yerine alış iadesi olarak işlenmeli.');
  const para = metin(yol(f, 'DocumentCurrencyCode')) || 'TRY';
  if (para !== 'TRY') uyarilar.push(`Fatura para birimi ${para}; tutarlar TL olarak kontrol edilmeli.`);
  const satirToplami = y2(satirlar.reduce((t, s) => t + s.tutar + s.kdv_tutari, 0));
  if (odenecek && Math.abs(satirToplami - odenecek) > 1) uyarilar.push(`Satırların toplamı (${satirToplami.toFixed(2)}) ödenecek tutardan (${odenecek.toFixed(2)}) farklı; fatura geneli iskonto olabilir.`);
  if (!satirlar.length) uyarilar.push('Faturada kalem satırı yok.');

  return {
    fatura: {
      no: metin(yol(f, 'ID')),
      ettn: metin(yol(f, 'UUID')) || null,
      tarih: metin(yol(f, 'IssueDate')).slice(0, 10) || null,
      tip: tip || null,
      senaryo: metin(yol(f, 'ProfileID')) || null,
      para,
      tedarikci: { ad: tedarikciAd || null, vkn: metin(vknDugum) || null },
      kdv_haric: sayi(yol(toplam, 'TaxExclusiveAmount')),
      kdv: sayi(yol(f, 'TaxTotal', 'TaxAmount')),
      odenecek
    },
    satirlar,
    uyarilar
  };
}

// Yuklenen dosya: XML ya da icinde XML olan ZIP (bazi portallar zip olarak indirir)
function dosyadanFatura(tampon) {
  if (tampon.length >= 4 && tampon.readUInt32LE(0) === 0x04034b50) {
    const dosyalar = zipDosyalari(tampon);
    const ad = [...dosyalar.keys()].find((a) => /\.xml$/i.test(a));
    if (!ad) throw new Error('ZIP içinde XML fatura bulunamadı');
    return faturaCoz(dosyaOku(tampon, dosyalar, ad));
  }
  return faturaCoz(tampon.toString('utf8').replace(/^﻿/, ''));
}

module.exports = { xmlAgac, faturaCoz, dosyadanFatura };
