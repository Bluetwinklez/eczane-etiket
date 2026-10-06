// Kullanim etiketi: kisa yazimi ("2x1 tok") okunur cumleye cevirir ve kutuya yapistirilacak etiket HTML'i uretir.
// Tarayicida window.KullanimEtiketi, testlerde require ile kullanilir.
(function (kok) {
  function birimBul(ilacAdi) {
    const a = String(ilacAdi || '').toLocaleLowerCase('tr-TR');
    if (/şurup|surup|süspansiyon|suspansiyon|solüsyon|solusyon|şrp/.test(a)) return 'ölçek';
    if (/damla/.test(a)) return 'damla';
    if (/sprey|inhaler|aerosol/.test(a)) return 'puf';
    if (/saşe|sase|efervesan/.test(a)) return 'saşe';
    if (/kapsül|kapsul|kaps\b/.test(a)) return 'kapsül';
    if (/krem|pomad|merhem|jel\b|losyon/.test(a)) return null; // haricen
    if (/fitil/.test(a)) return 'fitil';
    return 'tablet';
  }

  // JS \b Turkce harflerde calismaz; kelime siniri bosluk/noktalama ile aranir
  const K = (kelime) => new RegExp(`(?:^|[\\s,.;:/-])(?:${kelime})(?=$|[\\s,.;:/-])`);
  const ZAMANLAR = [
    [K('sabah'), 'sabah'],
    [K('öğle|ogle|öğlen|oglen'), 'öğle'],
    [K('akşam|aksam'), 'akşam'],
    [K('gece|yatmadan'), 'yatmadan önce']
  ];

  function kullanimMetni(kisa, ilacAdi) {
    const ham = String(kisa || '').trim();
    if (!ham) return '';
    const s = ham.toLocaleLowerCase('tr-TR').replace(',', '.');
    const parcalar = [];
    const m = s.match(/(\d+)\s*[x×*]\s*(1\/2|yarım|yarim|\d+(?:\.\d+)?)\s*(ml|mg|damla|puf|ölçek|olcek|tablet|kapsül|kapsul)?/);
    const birim = (m && m[3] && { olcek: 'ölçek', kapsul: 'kapsül' }[m[3]]) || (m && m[3]) || birimBul(ilacAdi);
    if (m) {
      const miktar = /yar|1\/2/.test(m[2]) ? 'yarım' : String(m[2]).replace('.', ',');
      parcalar.push(birim ? `Günde ${m[1]} kez ${miktar} ${birim}` : `Günde ${m[1]} kez sürünüz`);
    }
    const zamanlar = ZAMANLAR.filter(([d]) => d.test(s)).map(([, a]) => a);
    if (zamanlar.length) parcalar.push(zamanlar.join(' - '));
    if (K('tok').test(s) || /yemekten sonra/.test(s)) parcalar.push('tok karnına');
    else if (K('aç|ac').test(s) || /yemekten önce|yemekten once/.test(s)) parcalar.push('aç karnına');
    const gun = s.match(/(\d+)\s*gün/);
    if (gun) parcalar.push(`${gun[1]} gün kullanınız`);
    if (/haricen|harici/.test(s)) parcalar.push('haricen kullanılır');
    // Taninan bir kalip yoksa yazilan metin aynen kalir
    if (!m) return ham.charAt(0).toLocaleUpperCase('tr-TR') + ham.slice(1);
    return parcalar.join(', ').replace(/^./, (c) => c.toLocaleUpperCase('tr-TR')) + '.';
  }

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function etiketHtml({ ilac, kullanim, hasta, tarih, eczane, telefon }) {
    return `<div class="kullanim-etiket">
      <div class="ke-ilac">${esc(ilac)}</div>
      <div class="ke-kullanim">${esc(kullanim)}</div>
      <div class="ke-alt">${hasta ? `<span>${esc(hasta)}</span>` : ''}<span>${esc(tarih)}</span></div>
      <div class="ke-eczane">${esc(eczane)}${telefon ? ' · ' + esc(telefon) : ''}</div>
    </div>`;
  }

  const KullanimEtiketi = { kullanimMetni, birimBul, etiketHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = KullanimEtiketi;
  else kok.KullanimEtiketi = KullanimEtiketi;
})(typeof window !== 'undefined' ? window : globalThis);
