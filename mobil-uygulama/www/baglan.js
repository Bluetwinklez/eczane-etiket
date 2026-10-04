// Eczam Mobil kabugu: sunucu adresini alir, dogrular, kaydeder ve uygulamayi ona acar.
// Her eczanenin kendi sunucusu vardir; adres cihazda saklanir (localStorage).
(() => {
  'use strict';
  const ANAHTAR = 'eczanem:sunucu';
  const $ = (s) => document.querySelector(s);
  const hataKutu = $('#hata');
  const adresInput = $('#adres');
  const dugme = $('#baglan');

  const oku = () => {
    try {
      return localStorage.getItem(ANAHTAR) || '';
    } catch (e) {
      return '';
    }
  };
  const yaz = (v) => {
    try {
      if (v) localStorage.setItem(ANAHTAR, v);
      else localStorage.removeItem(ANAHTAR);
    } catch (e) {}
  };
  const hata = (m) => {
    hataKutu.textContent = m;
    hataKutu.hidden = !m;
  };

  // Yerel ag: localhost, 10.x, 172.16-31.x, 192.168.x, *.local
  function yerelAdresMi(host) {
    return (
      host === 'localhost' ||
      /\.local$/i.test(host) ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  }

  // Kullanicinin yazdigini guvenli bir kok adrese cevirir; gecersizse null + mesaj
  function adresiHazirla(ham) {
    let metin = String(ham || '').trim();
    if (!metin) return { hata: 'Sunucu adresini yazın.' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(metin)) {
      const hostBasi = metin.split(/[/:]/)[0];
      metin = (yerelAdresMi(hostBasi) ? 'http://' : 'https://') + metin;
    }
    let url;
    try {
      url = new URL(metin);
    } catch (e) {
      return { hata: 'Adres geçersiz görünüyor.' };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { hata: 'Yalnızca http(s) adresleri kullanılabilir.' };
    if (url.protocol === 'http:' && !yerelAdresMi(url.hostname)) {
      return { hata: 'Güvenlik için internet üzerindeki adresler HTTPS ile başlamalıdır.' };
    }
    return { adres: url.origin };
  }

  // Testler için dışa açılır (tarayıcıda zararsız)
  window.EczamBaglan = { adresiHazirla, yerelAdresMi };

  async function dogrula(adres) {
    const kontrol = new AbortController();
    const zaman = setTimeout(() => kontrol.abort(), 8000);
    try {
      const r = await fetch(adres + '/api/health', { signal: kontrol.signal, cache: 'no-store' });
      const j = await r.json().catch(() => null);
      return r.ok && j && j.ok === true;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(zaman);
    }
  }

  function ac(adres) {
    window.location.replace(adres + '/mobil/');
  }

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hata('');
    const s = adresiHazirla(adresInput.value);
    if (s.hata) return hata(s.hata);
    dugme.disabled = true;
    dugme.textContent = 'Bağlanılıyor…';
    const tamam = await dogrula(s.adres);
    dugme.disabled = false;
    dugme.textContent = 'Bağlan';
    if (!tamam) return hata('Bu adreste bir Eczam sunucusu bulunamadı. Adresi ve internet bağlantınızı kontrol edin.');
    yaz(s.adres);
    ac(s.adres);
  });

  // Kayitli sunucu varsa dogrudan ac; "?degistir=1" ile adres ekrani gosterilir
  const parametre = new URLSearchParams(location.search);
  const kayitli = oku();
  if (parametre.get('degistir') === '1') {
    yaz('');
    adresInput.value = parametre.get('onceki') || kayitli;
  } else if (kayitli) {
    adresInput.value = kayitli;
    dogrula(kayitli).then((tamam) => {
      if (tamam) ac(kayitli);
      else {
        hata('Kayıtlı sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin ya da adresi değiştirin.');
        // Cevrimdisiyken de uygulama onbellekten acilabilsin: kullanici "Yine de ac" diyebilir
        const yine = document.createElement('button');
        yine.type = 'button';
        yine.className = 'ikincil';
        yine.textContent = 'Yine de aç (çevrimdışı)';
        yine.addEventListener('click', () => ac(kayitli));
        $('#form').appendChild(yine);
      }
    });
  }

  const gizlilik = $('#gizlilik');
  if (kayitli) {
    gizlilik.hidden = false;
    gizlilik.href = kayitli + '/gizlilik.html';
  }
})();
