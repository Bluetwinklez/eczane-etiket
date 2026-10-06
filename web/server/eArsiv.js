// e-Arsiv fatura taslagi: perakende satistan GIB UBL-TR 1.2 (EARSIVFATURA) XML'i uretir.
// XML imzalanmaz ve GIB'e gonderilmez; eczanenin anlastigi entegrator / GIB e-Arsiv portalina yuklenir,
// imzalama ve raporlama orada yapilir. Satis fiyatlari KDV dahildir; satir tutarlari KDV haric hesaplanir.
const crypto = require('crypto');
const { db, ayarOku, ayarYaz } = require('./db');
const { yerelSimdi } = require('./zaman');

const AYAR = 'e_arsiv';
const VARSAYILAN = {
  unvan: '',
  vkn: '',
  eczaci_adi: '',
  vergi_dairesi: '',
  adres: '',
  ilce: '',
  il: '',
  telefon: '',
  eposta: '',
  seri: 'ECZ',
  kdv: { ilac: 10, medikal: 10, takviye: 10, dermokozmetik: 20, diger: 20 }
};
// e-Arsivde kimligi bilinmeyen nihai tuketici icin kullanilan TCKN
const NIHAI_TUKETICI = '11111111111';

const y2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const para = (n) => y2(n).toFixed(2);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ayarlar() {
  let kayitli = {};
  try {
    kayitli = JSON.parse(ayarOku(AYAR) || '{}');
  } catch {
    /* bozuk ayar varsayilana doner */
  }
  return { ...VARSAYILAN, ...kayitli, kdv: { ...VARSAYILAN.kdv, ...(kayitli.kdv || {}) } };
}

function ayarlariYaz(girdi) {
  const a = ayarlar();
  for (const k of ['unvan', 'vkn', 'eczaci_adi', 'vergi_dairesi', 'adres', 'ilce', 'il', 'telefon', 'eposta']) {
    if (girdi[k] !== undefined) a[k] = String(girdi[k] || '').trim().slice(0, 200);
  }
  if (girdi.seri !== undefined) a.seri = String(girdi.seri || '').trim().toUpperCase();
  if (girdi.kdv && typeof girdi.kdv === 'object') {
    for (const [tip, oran] of Object.entries(girdi.kdv)) if (tip in VARSAYILAN.kdv) a.kdv[tip] = Number(oran);
  }
  const hata = ayarHatasi(a, { tamami: false });
  if (hata) {
    const e = new Error(hata);
    e.kullanici = true;
    throw e;
  }
  ayarYaz(AYAR, JSON.stringify(a));
  return a;
}

function ayarHatasi(a, { tamami = true } = {}) {
  if (!/^[A-Z0-9]{3}$/.test(a.seri)) return 'Fatura serisi 3 harf/rakam olmalı (ör. ECZ)';
  if (Object.values(a.kdv).some((o) => !Number.isFinite(o) || o < 0 || o > 100)) return 'KDV oranları 0-100 arasında olmalı';
  if (a.vkn && !/^(\d{10}|\d{11})$/.test(a.vkn)) return 'VKN 10, TCKN 11 haneli olmalı';
  if (!tamami) return null;
  if (!a.unvan || !a.vkn || !a.vergi_dairesi || !a.il) return 'Önce fatura bilgilerini girin (ünvan, VKN/TCKN, vergi dairesi, il)';
  if (a.vkn.length === 11 && !a.eczaci_adi) return 'TCKN ile fatura kesmek için eczacının adı soyadı gerekir';
  return null;
}

// "Ad Soyad" -> { ad, soyad }: son kelime soyad
function adBol(tam) {
  const p = String(tam || '').trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return { ad: p[0] || 'Nihai', soyad: p[0] ? '-' : 'Tüketici' };
  return { ad: p.slice(0, -1).join(' '), soyad: p[p.length - 1] };
}

// Satis toplami (tum indirimler dusulmus) satirlara brut tutarlari oraninda dagitilir; kurus farki son satira yazilir
function satirlariHesapla(kalemler, toplam, kdvOranlari) {
  const brut = kalemler.reduce((t, k) => t + k.birim_fiyat * k.adet, 0);
  let kalan = y2(toplam);
  return kalemler.map((k, i) => {
    const satirBrut = k.birim_fiyat * k.adet;
    const net = i === kalemler.length - 1 ? y2(kalan) : y2(brut ? (satirBrut * toplam) / brut : 0);
    kalan = y2(kalan - net);
    const oran = kdvOranlari[k.urun_tipi] ?? kdvOranlari.diger;
    const tutar = y2(net / (1 + oran / 100)); // KDV haric, indirim dusulmus
    const birim = k.birim_fiyat / (1 + oran / 100);
    return {
      sira: i + 1,
      ad: k.ilac_adi,
      barkod: k.barkod || null,
      adet: k.adet,
      birim_fiyat: y2(birim),
      iskonto: Math.max(0, y2(birim * k.adet - tutar)),
      tutar,
      kdv_orani: oran,
      kdv: y2(net - tutar),
      toplam: net
    };
  });
}

function vergiXml(satirlar, girinti) {
  const gruplar = new Map();
  for (const s of satirlar) {
    const g = gruplar.get(s.kdv_orani) || { matrah: 0, vergi: 0 };
    g.matrah = y2(g.matrah + s.tutar);
    g.vergi = y2(g.vergi + s.kdv);
    gruplar.set(s.kdv_orani, g);
  }
  const vergi = y2([...gruplar.values()].reduce((t, g) => t + g.vergi, 0));
  const alt = [...gruplar.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([oran, g]) => `${girinti}  <cac:TaxSubtotal>
${girinti}    <cbc:TaxableAmount currencyID="TRY">${para(g.matrah)}</cbc:TaxableAmount>
${girinti}    <cbc:TaxAmount currencyID="TRY">${para(g.vergi)}</cbc:TaxAmount>
${girinti}    <cbc:Percent>${oran}</cbc:Percent>
${girinti}    <cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
${girinti}  </cac:TaxSubtotal>`
    )
    .join('\n');
  return `${girinti}<cac:TaxTotal>
${girinti}  <cbc:TaxAmount currencyID="TRY">${para(vergi)}</cbc:TaxAmount>
${alt}
${girinti}</cac:TaxTotal>`;
}

function taraf({ kimlik, unvan, kisi, adres, ilce, il, vergiDairesi, telefon, eposta }) {
  const tur = kimlik.length === 11 ? 'TCKN' : 'VKN';
  return `    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="${tur}">${esc(kimlik)}</cbc:ID></cac:PartyIdentification>
${unvan ? `      <cac:PartyName><cbc:Name>${esc(unvan)}</cbc:Name></cac:PartyName>\n` : ''}      <cac:PostalAddress>
${adres ? `        <cbc:StreetName>${esc(adres)}</cbc:StreetName>\n` : ''}        <cbc:CitySubdivisionName>${esc(ilce || il)}</cbc:CitySubdivisionName>
        <cbc:CityName>${esc(il)}</cbc:CityName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
${vergiDairesi ? `      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${esc(vergiDairesi)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>\n` : ''}${
    telefon || eposta
      ? `      <cac:Contact>${telefon ? `<cbc:Telephone>${esc(telefon)}</cbc:Telephone>` : ''}${eposta ? `<cbc:ElectronicMail>${esc(eposta)}</cbc:ElectronicMail>` : ''}</cac:Contact>\n`
      : ''
  }${tur === 'TCKN' ? `      <cac:Person><cbc:FirstName>${esc(kisi.ad)}</cbc:FirstName><cbc:FamilyName>${esc(kisi.soyad)}</cbc:FamilyName></cac:Person>\n` : ''}    </cac:Party>`;
}

function faturaXml({ no, ettn, tarih, saat, satici, alici, satirlar, notlar = [] }) {
  const kdvHaric = y2(satirlar.reduce((t, s) => t + s.tutar, 0));
  const kdv = y2(satirlar.reduce((t, s) => t + s.kdv, 0));
  const iskonto = y2(satirlar.reduce((t, s) => t + s.iskonto, 0));
  const satirXml = satirlar
    .map(
      (s) => `  <cac:InvoiceLine>
    <cbc:ID>${s.sira}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${s.adet}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">${para(s.tutar)}</cbc:LineExtensionAmount>
${
  s.iskonto > 0
    ? `    <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="TRY">${para(s.iskonto)}</cbc:Amount><cbc:BaseAmount currencyID="TRY">${para(s.birim_fiyat * s.adet)}</cbc:BaseAmount></cac:AllowanceCharge>\n`
    : ''
}${vergiXml([s], '    ')}
    <cac:Item>
      <cbc:Name>${esc(s.ad)}</cbc:Name>
${s.barkod ? `      <cac:SellersItemIdentification><cbc:ID>${esc(s.barkod)}</cbc:ID></cac:SellersItemIdentification>\n` : ''}    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="TRY">${para(s.birim_fiyat)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>EARSIVFATURA</cbc:ProfileID>
  <cbc:ID>${esc(no)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${esc(ettn)}</cbc:UUID>
  <cbc:IssueDate>${tarih}</cbc:IssueDate>
  <cbc:IssueTime>${saat}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
${notlar.map((n) => `  <cbc:Note>${esc(n)}</cbc:Note>`).join('\n')}
  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${satirlar.length}</cbc:LineCountNumeric>
  <cac:AdditionalDocumentReference><cbc:ID>ELEKTRONIK</cbc:ID><cbc:IssueDate>${tarih}</cbc:IssueDate><cbc:DocumentTypeCode>SEND_TYPE</cbc:DocumentTypeCode></cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
${taraf(satici)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
${taraf(alici)}
  </cac:AccountingCustomerParty>
${vergiXml(satirlar, '  ')}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">${para(kdvHaric)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">${para(kdvHaric)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">${para(kdvHaric + kdv)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="TRY">${para(iskonto)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="TRY">${para(kdvHaric + kdv)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${satirXml}
</Invoice>
`;
}

// GIB fatura numarasi: 3 karakter seri + yil + 9 haneli sira (16 karakter)
function siradakiNo(seri, yil) {
  const onek = `${seri}${yil}`;
  const son = db.prepare('SELECT fatura_no FROM e_arsiv_faturalari WHERE fatura_no LIKE ? ORDER BY fatura_no DESC LIMIT 1').get(`${onek}%`);
  const sira = son ? Number(son.fatura_no.slice(onek.length)) + 1 : 1;
  return onek + String(sira).padStart(9, '0');
}

// Satis icin faturayi olusturur (bir kez); alici: { ad_soyad, tc_no, adres, il } verilmezse satisin musterisi ya da nihai tuketici
function faturaOlustur(satisId, { kullaniciId = null, alici: aliciGirdi = null, simdi = yerelSimdi() } = {}) {
  const mevcut = db.prepare('SELECT * FROM e_arsiv_faturalari WHERE satis_id = ?').get(satisId);
  if (mevcut) return { fatura: mevcut, yeni: false };
  const a = ayarlar();
  const hata = ayarHatasi(a);
  if (hata) throw Object.assign(new Error(hata), { kullanici: true });
  const satis = db
    .prepare('SELECT s.*, m.ad_soyad, m.tc_no, m.adres AS m_adres, m.email AS m_email FROM satislar s LEFT JOIN musteriler m ON m.id = s.musteri_id WHERE s.id = ?')
    .get(satisId);
  if (!satis) throw Object.assign(new Error('Satış bulunamadı'), { durum: 404 });
  const kalemler = db
    .prepare('SELECT k.*, i.barkod, i.urun_tipi FROM satis_kalemleri k LEFT JOIN ilaclar i ON i.id = k.ilac_id WHERE k.satis_id = ? ORDER BY k.id')
    .all(satisId);
  if (!kalemler.length || !(satis.toplam_tutar > 0)) throw Object.assign(new Error('Tutarı olmayan satışa fatura kesilemez'), { kullanici: true });

  const g = aliciGirdi || {};
  const aliciAd = String(g.ad_soyad || satis.ad_soyad || '').trim();
  let aliciKimlik = String(g.tc_no || satis.tc_no || '').replace(/\D/g, '');
  if (!/^(\d{10}|\d{11})$/.test(aliciKimlik)) aliciKimlik = NIHAI_TUKETICI;
  const alici = {
    kimlik: aliciKimlik,
    unvan: aliciKimlik.length === 10 ? aliciAd : '',
    kisi: adBol(aliciKimlik === NIHAI_TUKETICI && !aliciAd ? 'Nihai Tüketici' : aliciAd),
    adres: String(g.adres || satis.m_adres || '').trim(),
    il: String(g.il || '').trim() || a.il,
    ilce: String(g.ilce || '').trim() || (g.il ? '' : a.ilce),
    eposta: String(g.eposta || satis.m_email || '').trim()
  };
  const satici = {
    kimlik: a.vkn,
    unvan: a.unvan,
    kisi: adBol(a.eczaci_adi),
    adres: a.adres,
    ilce: a.ilce,
    il: a.il,
    vergiDairesi: a.vergi_dairesi,
    telefon: a.telefon,
    eposta: a.eposta
  };
  const satirlar = satirlariHesapla(kalemler, satis.toplam_tutar, a.kdv);
  const yerel = simdi.toISOString(); // yerel saat (UTC+fark) olarak verilir
  const tarih = yerel.slice(0, 10);
  const saat = yerel.slice(11, 19);
  const notlar = [`Eczam satış no: ${satis.id}`];
  if (satis.sgk_recete) notlar.push('SGK reçeteli satış: bu fatura hastanın ödediği tutar içindir; SGK payı aylık SGK faturasıyla kesilir.');

  db.exec('BEGIN IMMEDIATE');
  try {
    const no = siradakiNo(a.seri, tarih.slice(0, 4));
    const ettn = crypto.randomUUID().toUpperCase();
    const xml = faturaXml({ no, ettn, tarih, saat, satici, alici, satirlar, notlar });
    const kdvHaric = y2(satirlar.reduce((t, s) => t + s.tutar, 0));
    const kdv = y2(satirlar.reduce((t, s) => t + s.kdv, 0));
    const id = db
      .prepare(
        `INSERT INTO e_arsiv_faturalari (satis_id, sube_id, fatura_no, ettn, tarih, alici_ad, alici_kimlik, kdv_haric, kdv, toplam, xml, kullanici_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(satisId, satis.sube_id, no, ettn, `${tarih} ${saat}`, aliciAd || 'Nihai Tüketici', aliciKimlik, kdvHaric, kdv, y2(kdvHaric + kdv), xml, kullaniciId).lastInsertRowid;
    db.exec('COMMIT');
    return { fatura: db.prepare('SELECT * FROM e_arsiv_faturalari WHERE id = ?').get(id), yeni: true };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { ayarlar, ayarlariYaz, ayarHatasi, satirlariHesapla, faturaXml, faturaOlustur, NIHAI_TUKETICI };
