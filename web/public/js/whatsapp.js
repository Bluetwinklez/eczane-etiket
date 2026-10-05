// WhatsApp'ta hazir mesajla sohbet acma (wa.me). API anahtari gerekmez: mesaj eczanenin kendi
// WhatsApp'indan (bilgisayarda WhatsApp Desktop/Web, telefonda uygulama) gozden gecirilip gonderilir.
// Tarayicida window.EczamWA, testlerde require ile kullanilir.
(function (kok) {
  // Turkiye numaralarini uluslararasi bicime cevirir: 0532 111 22 33 → 905321112233
  function numara(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (/^0\d{10}$/.test(d)) d = '9' + d;
    else if (/^5\d{9}$/.test(d)) d = '90' + d;
    if (d.startsWith('90') && d.length !== 12) return null;
    return /^\d{11,15}$/.test(d) ? d : null;
  }

  function link(tel, mesaj) {
    const n = numara(tel);
    if (!n) return null;
    return `https://wa.me/${n}${mesaj ? '?text=' + encodeURIComponent(mesaj) : ''}`;
  }

  const kapanis = 'Sağlıklı günler dileriz.';
  const tarihTr = (t) => {
    const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(t || '');
  };
  const SABLONLAR = {
    ilacBitis: ({ ad, ilac, tarih, gecti }) =>
      `Merhaba ${ad}, ${ilac} ilacınız ${tarihTr(tarih)} tarihinde ${gecti ? 'bitmiş olabilir' : 'bitiyor'}. Yenilemek isterseniz eczanemiz hazır. ${kapanis}`,
    raporBitis: ({ ad, ilac, tarih }) =>
      `Merhaba ${ad}, ${ilac ? ilac + ' için ' : ''}ilaç raporunuzun süresi ${tarihTr(tarih)} tarihinde doluyor. Yenileme için doktorunuza başvurmanızı hatırlatırız. ${kapanis}`,
    urunGeldi: ({ ad, urun }) => `Merhaba ${ad}, istediğiniz ${urun} eczanemize geldi. Uygun olduğunuzda alabilirsiniz. ${kapanis}`,
    bakiye: ({ ad, tutar }) => `Merhaba ${ad}, eczanemizdeki hesap bakiyeniz ${tutar}. Bilginize sunarız. ${kapanis}`
  };

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Tablo satirlari icin hazir dugme; numara gecersizse bos doner
  function dugme(tel, mesaj, etiket = 'WhatsApp') {
    const u = link(tel, mesaj);
    return u
      ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="WhatsApp'ta hazır mesajla aç"><button type="button" class="secondary">${esc(etiket)}</button></a>`
      : '';
  }

  const EczamWA = { numara, link, dugme, SABLONLAR };
  if (typeof module !== 'undefined' && module.exports) module.exports = EczamWA;
  else kok.EczamWA = EczamWA;
})(typeof window !== 'undefined' ? window : globalThis);
