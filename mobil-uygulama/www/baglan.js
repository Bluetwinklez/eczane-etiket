// Eczam Mobil kabugu: eczanedeki Eczam sunucusunu yerel agda kendisi bulur, dogrular, kaydeder
// ve uygulamayi ona acar. Bulamazsa (ya da internetteki bir sunucu icin) adres elle girilir.
// Adres cihazda saklanir (localStorage).
(() => {
  'use strict';
  const ANAHTAR = 'eczanem:sunucu';
  const PORT = 3000;
  // Turkiye'deki modemlerin yaygin yerel aglari; en yaygin olan once taranir
  const AGLAR = [
    '192.168.1', '192.168.0', '192.168.2', '192.168.3', '192.168.4', '192.168.5',
    '192.168.10', '192.168.11', '192.168.100', '192.168.88', '192.168.178',
    '10.0.0', '10.0.1', '10.10.10', '172.16.0',
  ];
  // Herkese acik demo sunucusu (ornek veriler); render.yaml ile kurulur
  const DEMO_ADRES = 'https://eczam-demo.onrender.com';
  const ESZAMANLI = 64;
  const YOKLAMA_MS = 1200;

  const $ = (s) => document.querySelector(s);
  const hataKutu = $('#hata');
  const adresInput = $('#adres');
  const dugme = $('#baglan');
  const form = $('#form');
  const arama = $('#arama');
  const aramaMetin = $('#arama-metin');
  const aramaAyrinti = $('#arama-ayrinti');
  const aramaCubuk = $('#arama-cubuk');
  const bulunanlar = $('#bulunanlar');
  const bulunanListe = $('#bulunan-liste');
  const tekrarDugme = $('#tekrar-ara');
  const elleDugme = $('#elle');
  const aciklama = $('#aciklama');
  const demoDugme = $('#demo');

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
    if (url.username || url.password) return { hata: 'Sunucu adresinde kullanıcı adı veya parola kullanılamaz.' };
    if (!url.hostname || url.hostname === '0.0.0.0' || url.hostname === '[::]') return { hata: 'Geçerli bir sunucu adresi yazın.' };
    if (url.protocol === 'http:' && !yerelAdresMi(url.hostname)) {
      return { hata: 'Güvenlik için internet üzerindeki adresler HTTPS ile başlamalıdır.' };
    }
    // Yerel adreste port yazilmadiysa Eczam'in varsayilan portu kullanilir
    if (url.protocol === 'http:' && !url.port && /^[\d.]+$/.test(url.hostname)) url.port = String(PORT);
    return { adres: url.origin };
  }

  // Taranacak adresler: verilen agin 1-254 arasi, Eczam portunda
  function agAdresleri(onek) {
    const liste = [];
    for (let i = 1; i <= 254; i++) liste.push(`http://${onek}.${i}:${PORT}`);
    return liste;
  }

  // Adreste Eczam varsa { adres, ad } doner; yoksa null
  async function yokla(adres, ms) {
    const kontrol = new AbortController();
    const zaman = setTimeout(() => kontrol.abort(), ms);
    try {
      const r = await fetch(adres + '/api/health', {
        signal: kontrol.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: { 'Accept': 'application/json' },
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.ok !== true) return null;
      // Eski sunucular yalnizca { ok: true } doner; yeni sunucular kendini tanitir
      if (j.uygulama && j.uygulama !== 'eczam') return null;
      return { adres, ad: typeof j.ad === 'string' ? j.ad : '' };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(zaman);
    }
  }
  const dogrula = async (adres) => Boolean(await yokla(adres, 8000));

  // Ag(lar)i tarar; bir agda Eczam bulununca o agi bitirip durur
  async function agiTara({ aglar = AGLAR, eszamanli = ESZAMANLI, ms = YOKLAMA_MS, ilerleme = () => {}, iptal = () => false, yoklayici = yokla } = {}) {
    const bulunan = [];
    for (let a = 0; a < aglar.length; a++) {
      const adresler = agAdresleri(aglar[a]);
      let sira = 0;
      const isci = async () => {
        while (sira < adresler.length && !iptal()) {
          const adres = adresler[sira++];
          const sonuc = await yoklayici(adres, ms);
          if (sonuc) bulunan.push(sonuc);
        }
      };
      ilerleme({ ag: aglar[a], sira: a, toplam: aglar.length });
      await Promise.all(Array.from({ length: Math.min(eszamanli, adresler.length) }, isci));
      if (iptal() || bulunan.length) break;
    }
    return bulunan;
  }

  // Testler için dışa açılır (tarayıcıda zararsız)
  window.EczamBaglan = { adresiHazirla, yerelAdresMi, agAdresleri, agiTara, AGLAR, DEMO_ADRES };

  function ac(adres) {
    window.location.replace(adres + '/mobil/');
  }
  function kaydetVeAc(adres) {
    yaz(adres);
    ac(adres);
  }

  let aramaIptal = false;
  function elleGirisGoster(deger) {
    aramaIptal = true;
    arama.hidden = true;
    elleDugme.hidden = true;
    form.hidden = false;
    aciklama.textContent = 'Eczanenizin Eczam sunucu adresini yazın. Adresi eczane bilgisayarındaki Eczam ekranında ya da yöneticinizden öğrenebilirsiniz.';
    if (deger) adresInput.value = deger;
  }

  async function aramayiBaslat({ yeniden = 0 } = {}) {
    aramaIptal = false;
    hata('');
    form.hidden = true;
    bulunanlar.hidden = true;
    tekrarDugme.hidden = true;
    elleDugme.hidden = false;
    arama.hidden = false;
    aramaMetin.textContent = 'Eczanedeki Eczam aranıyor…';
    const basla = Date.now();
    const sonuclar = await agiTara({
      iptal: () => aramaIptal,
      ilerleme: ({ ag, sira, toplam }) => {
        aramaAyrinti.textContent = `${ag}.x ağı taranıyor`;
        aramaCubuk.style.width = `${Math.round(((sira + 1) / toplam) * 100)}%`;
      },
    });
    if (aramaIptal) return;
    arama.hidden = true;
    // Ayni sunucu birden cok kez donmesin
    const tekil = [...new Map(sonuclar.map((s) => [s.adres, s])).values()];
    if (tekil.length === 1) {
      aramaMetin.textContent = 'Bulundu';
      return kaydetVeAc(tekil[0].adres);
    }
    if (tekil.length > 1) {
      elleDugme.hidden = false;
      bulunanlar.hidden = false;
      bulunanListe.textContent = '';
      for (const s of tekil) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ikincil';
        b.textContent = `${s.ad || 'Eczam'} · ${s.adres.replace(/^https?:\/\//, '')}`;
        b.addEventListener('click', () => kaydetVeAc(s.adres));
        bulunanListe.appendChild(b);
      }
      return;
    }
    // Hic yanit yok ve tarama cok kisa surduyse iOS "Yerel Ag" izni henuz verilmemistir: biraz bekleyip yeniden dene
    if (Date.now() - basla < 4000 && yeniden < 3) {
      aramaMetin.textContent = 'Yerel ağ izni bekleniyor…';
      arama.hidden = false;
      setTimeout(() => !aramaIptal && aramayiBaslat({ yeniden: yeniden + 1 }), 3000);
      return;
    }
    hata('Eczanedeki Eczam bulunamadı. Telefonun eczanenin Wi-Fi ağına bağlı olduğundan, Eczam\'ın bilgisayarda açık olduğundan ve "Yerel Ağ" iznini verdiğinizden emin olun (Ayarlar › Eczam › Yerel Ağ).');
    tekrarDugme.hidden = false;
    elleDugme.hidden = false;
  }

  elleDugme.addEventListener('click', () => elleGirisGoster(''));

  // Demo: adres yazmadan ornek verili sunucuya baglanir. Ucretsiz sunucu uykudaysa uyanmasi ~1 dk surer.
  demoDugme.addEventListener('click', async () => {
    aramaIptal = true;
    hata('');
    form.hidden = true;
    bulunanlar.hidden = true;
    tekrarDugme.hidden = true;
    demoDugme.disabled = true;
    arama.hidden = false;
    aramaMetin.textContent = 'Demo açılıyor…';
    aramaAyrinti.textContent = 'Demo sunucusu uykudaysa açılması bir dakika kadar sürebilir.';
    aramaCubuk.style.width = '100%';
    const tamam = await yokla(DEMO_ADRES, 75000);
    demoDugme.disabled = false;
    if (tamam) return kaydetVeAc(DEMO_ADRES);
    arama.hidden = true;
    hata('Demo sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
    tekrarDugme.hidden = false;
    elleDugme.hidden = false;
  });
  tekrarDugme.addEventListener('click', () => aramayiBaslat());

  form.addEventListener('submit', async (e) => {
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
    kaydetVeAc(s.adres);
  });

  // Kayitli sunucu varsa dogrudan ac; "?degistir=1" ile adres ekrani gosterilir
  const parametre = new URLSearchParams(location.search);
  const kayitli = oku();
  if (parametre.get('degistir') === '1') {
    yaz('');
    aramayiBaslat();
  } else if (kayitli) {
    aciklama.textContent = 'Eczanenizin sunucusuna bağlanılıyor…';
    dogrula(kayitli).then((tamam) => {
      if (tamam) return ac(kayitli);
      let host = '';
      try {
        host = new URL(kayitli).hostname;
      } catch (e) {}
      // Yerel sunucunun adresi degismis olabilir (modem yeni IP vermis): agda yeniden ara
      if (yerelAdresMi(host)) {
        aramayiBaslat();
      } else {
        elleGirisGoster(kayitli);
        hata('Kayıtlı sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin ya da adresi değiştirin.');
      }
      // Cevrimdisiyken de uygulama onbellekten acilabilsin
      const yine = document.createElement('button');
      yine.type = 'button';
      yine.className = 'ikincil';
      yine.textContent = 'Yine de aç (çevrimdışı)';
      yine.addEventListener('click', () => ac(kayitli));
      $('#kutu').appendChild(yine);
    });
  } else {
    aramayiBaslat();
  }

  const gizlilik = $('#gizlilik');
  if (kayitli) {
    gizlilik.hidden = false;
    gizlilik.href = kayitli + '/gizlilik.html';
  }
})();
