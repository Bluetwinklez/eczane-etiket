// Eczam Mobil — tek dosyalik istemci: hash yonlendirme, ekranlar, tarama, cevrimdisi kuyruk.
(() => {
  'use strict';

  // ---------- Yardimcilar ----------
  const YEREL = (window.EczamDil && window.EczamDil.yerel) || 'tr-TR';
  const $ = (s, k = document) => k.querySelector(s);
  const esc = (m) => String(m ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tl = (n) => (Number(n) || 0).toLocaleString(YEREL, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
  const tlKisa = (n) => {
    n = Number(n) || 0;
    return n >= 1000 ? (n / 1000).toLocaleString(YEREL, { maximumFractionDigits: 1 }) + (YEREL === 'tr-TR' ? 'B' : 'K') + ' ₺' : Math.round(n).toLocaleString(YEREL) + ' ₺';
  };
  const baslar = (ad) => String(ad || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toLocaleUpperCase('tr-TR')).join('');
  const yerel = (key, varsayilan) => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? varsayilan : JSON.parse(v);
    } catch (e) {
      return varsayilan;
    }
  };
  const yerelYaz = (key, v) => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  };

  const IKON = {
    ev: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    grafik: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    tara: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>',
    kutu: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
    zil: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    geri: '<path d="m15 6-6 6 6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    ara: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    kapat: '<path d="M6 6l12 12M18 6 6 18"/>'
  };
  const svg = (ad) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[ad]}</svg>`;

  // Eczaci maskotu (referans tasarimdaki karakterin sade karsiligi)
  const MASKOT = `<svg viewBox="0 0 200 220" role="img" aria-label="Eczacı maskotu">
    <rect x="62" y="108" width="76" height="100" rx="18" fill="#fff" stroke="#111" stroke-width="5"/>
    <path d="M100 108v100" stroke="#111" stroke-width="4"/>
    <rect x="86" y="118" width="28" height="30" rx="6" fill="#8fd3e8" stroke="#111" stroke-width="4"/>
    <circle cx="100" cy="64" r="38" fill="#f6d2b0" stroke="#111" stroke-width="5"/>
    <path d="M64 56c4-26 68-26 72 0-14-10-58-10-72 0Z" fill="#3b2a1d" stroke="#111" stroke-width="4"/>
    <rect x="68" y="56" width="30" height="18" rx="7" fill="#111"/><rect x="102" y="56" width="30" height="18" rx="7" fill="#111"/>
    <path d="M86 84q14 12 28 0" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
    <path d="M62 126 30 96M138 126l32-30" stroke="#111" stroke-width="16" stroke-linecap="round"/>
    <path d="M62 126 30 96M138 126l32-30" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
    <circle cx="26" cy="90" r="9" fill="#f6d2b0" stroke="#111" stroke-width="4"/><circle cx="174" cy="90" r="9" fill="#f6d2b0" stroke="#111" stroke-width="4"/>
  </svg>`;
  const ILAC_KUTUSU = `<svg viewBox="0 0 140 120" aria-hidden="true">
    <rect x="12" y="38" width="46" height="74" rx="10" fill="#f9b572" stroke="#111" stroke-width="4"/><rect x="18" y="26" width="34" height="16" rx="5" fill="#fff" stroke="#111" stroke-width="4"/>
    <rect x="62" y="22" width="52" height="90" rx="12" fill="#9d8df1" stroke="#111" stroke-width="4"/><rect x="70" y="42" width="36" height="28" rx="6" fill="#fff" stroke="#111" stroke-width="3"/>
    <ellipse cx="116" cy="100" rx="18" ry="9" fill="#f4a6e8" stroke="#111" stroke-width="3.5"/>
  </svg>`;

  // ---------- API ----------
  const oturum = { kullanici: null };
  let cevrimiciMi = navigator.onLine;

  async function api(yontem, url, govde, { onbellek = false } = {}) {
    const secenek = { method: yontem, headers: {}, credentials: 'same-origin' };
    if (govde !== undefined) {
      secenek.headers['Content-Type'] = 'application/json';
      secenek.body = JSON.stringify(govde);
    }
    let res;
    try {
      res = await fetch(url, secenek);
    } catch (e) {
      cevrimiciMi = false;
      if (yontem === 'GET' && onbellek) {
        const kayit = yerel('onb:' + url, null);
        if (kayit) {
          // Dizi ise dizi olarak don (liste ekranlari Array bekler); nesneyse isaretle
          if (Array.isArray(kayit.veri)) {
            const dizi = [...kayit.veri];
            dizi.__onbellekten = kayit.zaman;
            return dizi;
          }
          return { ...kayit.veri, __onbellekten: kayit.zaman };
        }
      }
      const hata = new Error('Sunucuya ulaşılamıyor');
      hata.cevrimdisi = true;
      throw hata;
    }
    cevrimiciMi = true;
    const tur = res.headers.get('content-type') || '';
    const veri = res.status === 204 ? null : tur.includes('json') ? await res.json() : await res.text();
    if (res.status === 401 && !url.includes('/api/auth/login')) {
      oturum.kullanici = null;
      if (location.hash !== '#/giris') location.hash = '#/giris';
      throw new Error('Oturum sona erdi');
    }
    if (!res.ok) {
      const h = new Error((veri && veri.error) || 'Bir hata oluştu');
      h.durum = res.status;
      h.kod = veri && veri.kod;
      throw h;
    }
    if (yontem === 'GET' && onbellek) yerelYaz('onb:' + url, { zaman: Date.now(), veri });
    return veri;
  }
  const get = (u, o) => api('GET', u, undefined, o);
  const post = (u, b) => api('POST', u, b);
  const put = (u, b) => api('PUT', u, b);

  // ---------- Cevrimdisi kuyruk (sayim, istek, sicaklik) ----------
  const KUYRUK = 'eczanem:kuyruk';
  const kuyrukOku = () => yerel(KUYRUK, []);
  async function kuyruklaGonder(yontem, url, govde, aciklama) {
    try {
      return await api(yontem, url, govde);
    } catch (e) {
      if (!e.cevrimdisi) throw e;
      const k = kuyrukOku();
      k.push({ id: Date.now() + Math.random(), yontem, url, govde, aciklama, zaman: Date.now() });
      yerelYaz(KUYRUK, k);
      toast('Bağlantı yok: kayıt sıraya alındı');
      kuyrukRozeti();
      return { kuyrukta: true };
    }
  }
  async function kuyruguBosalt() {
    const k = kuyrukOku();
    if (!k.length || !cevrimiciMi) return;
    const kalan = [];
    let gonderilen = 0;
    for (const oge of k) {
      try {
        await api(oge.yontem, oge.url, oge.govde);
        gonderilen += 1;
      } catch (e) {
        if (e.cevrimdisi) kalan.push(oge);
        // Sunucu reddettiyse (4xx) kayit atilir: tekrar denemek ise yaramaz
      }
    }
    yerelYaz(KUYRUK, kalan);
    if (gonderilen) toast(`${gonderilen} bekleyen kayıt gönderildi`);
    kuyrukRozeti();
  }
  function kuyrukRozeti() {
    const r = $('#kuyruk-rozet');
    const n = kuyrukOku().length;
    if (r) {
      r.textContent = n;
      r.hidden = n === 0;
    }
  }
  window.addEventListener('online', () => {
    cevrimiciMi = true;
    kuyruguBosalt();
  });
  window.addEventListener('offline', () => {
    cevrimiciMi = false;
  });

  // ---------- Toast / sheet ----------
  let toastZ;
  function toast(m) {
    let t = $('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = m;
    t.hidden = false;
    clearTimeout(toastZ);
    toastZ = setTimeout(() => (t.hidden = true), 2600);
  }
  function sayfaAc(html) {
    const perde = document.createElement('div');
    perde.className = 'perde';
    perde.innerHTML = `<div class="sayfa" role="dialog" aria-modal="true"><div class="tutamak"></div>${html}</div>`;
    perde.addEventListener('click', (e) => e.target === perde && perde.remove());
    document.body.appendChild(perde);
    return perde;
  }

  // ---------- Duzen (iskelet) ----------
  const uyg = $('#uygulama');
  const gezinme = $('#alt-gezinme');
  const SEKMELER = [
    { k: 'ozet', ad: 'Özet', ikon: 'ev' },
    { k: 'satis', ad: 'Satış', ikon: 'grafik' },
    { k: 'tara', ad: 'Tara', ikon: 'tara' },
    { k: 'urunler', ad: 'Ürünler', ikon: 'kutu' },
    { k: 'bildirim', ad: 'Bildirim', ikon: 'zil' }
  ];
  const ZEMIN = { ozet: 'var(--turuncu)', satis: 'var(--yesil)', tara: 'var(--mavi)', urunler: 'var(--sari)', bildirim: 'var(--pembe)', profil: 'var(--mor)', giris: 'var(--turuncu)' };
  let bildirimSayisi = 0;

  function gezinmeCiz(aktif) {
    gezinme.hidden = false;
    gezinme.innerHTML = SEKMELER.map(
      (s) =>
        `<a href="#/${s.k}" class="${s.k === aktif ? 'aktif' : ''}" aria-label="${s.ad}" ${s.k === aktif ? 'aria-current="page"' : ''}>${svg(s.ikon)}<span>${s.ad}</span>${
          s.k === 'bildirim' && bildirimSayisi ? `<b class="sayi">${bildirimSayisi > 99 ? '99+' : bildirimSayisi}</b>` : ''
        }</a>`
    ).join('');
  }

  function cerceve(baslik, aktif, icerik, { geri = false } = {}) {
    document.documentElement.style.setProperty('--zemin', ZEMIN[aktif] || 'var(--turuncu)');
    const tema = document.querySelector('meta[name="theme-color"]');
    if (tema) tema.setAttribute('content', { ozet: '#f9b572', satis: '#b8e986', tara: '#8fd3e8', urunler: '#f6e27f', bildirim: '#f4a6e8', profil: '#9d8df1' }[aktif] || '#f9b572');
    uyg.innerHTML = `
      <header class="ust-bar">
        ${geri ? `<a class="yuvarlak" style="background:var(--mercan)" href="#/ozet" aria-label="Geri">${svg('geri')}</a>` : `<a class="yuvarlak" style="background:var(--beyaz)" href="#/ozet" aria-label="Eczam ana sayfa"><img src="../img/logo-isaret.svg" alt="" /></a>`}
        <h1>${esc(baslik)}</h1>
        <a class="yuvarlak" style="background:var(--sari)" href="#/profil" aria-label="Profil">${esc(baslar(oturum.kullanici && oturum.kullanici.ad_soyad))}</a>
      </header>
      <main class="ekran-giris">${icerik}</main>`;
    gezinmeCiz(aktif);
    window.scrollTo(0, 0);
  }

  const hataKutusu = (e) => `<div class="hata-kutu" role="alert">${esc(e.message)}</div>`;
  const cevrimdisiNot = (veri) =>
    veri && veri.__onbellekten ? `<div class="hata-kutu" style="background:var(--sari)">Çevrimdışı: ${new Date(veri.__onbellekten).toLocaleString(YEREL)} tarihli kayıt gösteriliyor.</div>` : '';

  // ---------- Ekran: giris ----------
  function girisEkrani(mesaj, sifreDegis) {
    gezinme.hidden = true;
    document.documentElement.style.setProperty('--zemin', 'var(--turuncu)');
    if (sifreDegis) {
      uyg.innerHTML = `<div class="giris ekran-giris">
        <div class="logo-kutu"><img src="../img/logo-isaret.svg" alt="" /></div>
        <h1 class="dev-baslik">Yeni şifre belirleyin</h1>
        <p class="alt-yazi">Güvenliğiniz için devam etmeden şifrenizi değiştirmelisiniz (en az 8 karakter, harf ve rakam).</p>
        <div id="giris-hata"></div>
        <form id="sifre-form">
          <label class="etiket" for="mevcut">Mevcut şifre</label><input class="alan" id="mevcut" type="password" autocomplete="current-password" required />
          <label class="etiket" for="yeni" style="margin-top:12px">Yeni şifre</label><input class="alan" id="yeni" type="password" autocomplete="new-password" minlength="8" required />
          <button class="hap siyah" style="margin-top:18px" type="submit">Şifreyi Değiştir</button>
        </form></div>`;
      $('#sifre-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await post('/api/auth/sifre-degistir', { mevcut_sifre: $('#mevcut').value, yeni_sifre: $('#yeni').value });
          const me = await get('/api/auth/me');
          oturum.kullanici = me.user;
          toast('Şifre değiştirildi');
          location.hash = '#/ozet';
        } catch (err) {
          $('#giris-hata').innerHTML = hataKutusu(err);
        }
      });
      return;
    }
    uyg.innerHTML = `<div class="giris ekran-giris">
      <div class="logo-kutu"><img src="../img/logo-isaret.svg" alt="" /></div>
      <h1 class="dev-baslik">Eczam<br />Mobil</h1>
      <p class="alt-yazi">Eczanenizi cebinizden izleyin.</p>
      <div id="giris-hata">${mesaj ? hataKutusu({ message: mesaj }) : ''}</div>
      <form id="giris-form">
        <label class="etiket" for="kad">Kullanıcı adı</label><input class="alan" id="kad" autocomplete="username" autocapitalize="none" required />
        <label class="etiket" for="sif" style="margin-top:12px">Şifre</label><input class="alan" id="sif" type="password" autocomplete="current-password" required />
        <button class="hap siyah" style="margin-top:18px" type="submit">Giriş Yap</button>
      </form></div>`;
    $('#giris-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const dugme = e.target.querySelector('button');
      dugme.disabled = true;
      try {
        const r = await post('/api/auth/login', { kullanici_adi: $('#kad').value.trim(), sifre: $('#sif').value });
        oturum.kullanici = r.user;
        if (r.user.sifre_degistirilmeli) return girisEkrani(null, true);
        location.hash = '#/ozet';
      } catch (err) {
        $('#giris-hata').innerHTML = hataKutusu(err);
        dugme.disabled = false;
      }
    });
  }

  // ---------- Ekran: ozet ----------
  let donem = yerel('eczanem:donem', 'gun');
  const FARK_METNI = { gun: 'dünden', hafta: 'önceki 7 günden', ay: 'geçen ayın aynı gününden' };
  function farkMetni(simdi, once, donemAdi) {
    const f = simdi - once;
    if (!once && !simdi) return 'Henüz satış yok';
    return `${f >= 0 ? '+' : '−'}${tl(Math.abs(f))} ${f >= 0 ? 'fazla' : 'az'}, ${FARK_METNI[donemAdi]}`;
  }
  async function ozetEkrani() {
    cerceve('Eczane Özeti', 'ozet', '<div class="yukleniyor">Yükleniyor…</div>');
    let d;
    try {
      d = await get('/api/mobil/ozet?donem=' + donem, { onbellek: true });
    } catch (e) {
      return cerceve('Eczane Özeti', 'ozet', hataKutusu(e));
    }
    const hedef = await get('/api/hedefler/aktif', { onbellek: true }).catch(() => null);
    const ad = (oturum.kullanici.ad_soyad || '').split(' ')[0];
    cerceve(
      'Eczane Özeti',
      'ozet',
      `${cevrimdisiNot(d)}
      <h2 class="dev-baslik">Merhaba ${esc(ad)}!</h2>
      <p class="alt-yazi">Bugün satışları hızlandıralım.</p>
      <div class="cipler" role="tablist">${[['gun', 'Bugün'], ['hafta', 'Hafta'], ['ay', 'Ay']]
        .map(([k, a]) => `<button class="hap ${donem === k ? 'secili' : ''}" data-donem="${k}" role="tab" aria-selected="${donem === k}">${a}</button>`)
        .join('')}</div>
      <a class="kart kart-dokun bg-yesil" href="#/satis">
        <h2>Reçeteli<br />İlaçlar</h2><div class="tutar">${tl(d.receteli)}</div>
        <div class="fark">${d.adet} satış · toplam ${tl(d.toplam)}</div>${ILAC_KUTUSU.replace('<svg', '<svg class="resim"')}
      </a>
      <a class="kart kart-dokun bg-mercan" href="#/satis">
        <h2>Reçetesiz<br />Ürünler</h2><div class="tutar">${tl(d.recetesiz)}</div>
        <div class="fark">${esc(farkMetni(d.toplam, d.onceki.toplam, d.donem))}</div>${ILAC_KUTUSU.replace('<svg', '<svg class="resim"')}
      </a>
      <div class="kart-ikili">
        <a class="kart kart-dokun bg-sari" href="#/urunler?filtre=kritik"><h2>Kritik stok</h2><div class="tutar">${d.kritik_stok}</div><div class="fark" style="max-width:none">ürün azaldı</div></a>
        <a class="kart kart-dokun bg-mavi" href="#/urunler?filtre=skt"><h2>SKT uyarısı</h2><div class="tutar">${d.skt_yakin}</div><div class="fark" style="max-width:none">parti 30 gün içinde</div></a>
      </div>
      ${
        hedef && hedef.hedef
          ? `<a class="kart kart-dokun bg-mor" href="#/satis" style="margin-top:14px"><h2>Aylık hedef</h2><div class="tutar">%${Math.round(hedef.yuzde)}</div>
              <div class="fark" style="max-width:none">${tl(hedef.gerceklesen)} / ${tl(hedef.hedef)}${hedef.gunluk_gereken ? ` · günde ${tl(hedef.gunluk_gereken)} gerekli` : ''}</div>
              <div style="height:12px;border:2.5px solid var(--cizgi);border-radius:999px;background:var(--beyaz);margin-top:10px;overflow:hidden"><div style="height:100%;width:${Math.min(100, hedef.yuzde)}%;background:var(--yesil)"></div></div></a>`
          : ''
      }
      <h3 class="bolum-baslik">Hızlı işlemler</h3>
      <div class="kart-ikili">
        <a class="kart kart-dokun bg-mor" href="#/hizli-satis"><h2>Hızlı satış</h2><div class="fark" style="max-width:none">Sepete ekle, sat</div></a>
        <a class="kart kart-dokun bg-pembe" href="#/musteriler"><h2>Müşteriler</h2><div class="fark" style="max-width:none">Veresiye, tahsilat</div></a>
        <a class="kart kart-dokun bg-sari" href="#/gorevler"><h2>Görevler</h2><div class="fark" style="max-width:none">Yapılacaklar listesi</div></a>
        <a class="kart kart-dokun bg-yesil" href="#/kasa"><h2>Günün kasası</h2><div class="fark" style="max-width:none">Nakit, kart, veresiye</div></a>
        ${
          ['admin', 'eczaci'].includes(oturum.kullanici.rol)
            ? '<a class="kart kart-dokun bg-mercan" href="#/iade"><h2>İade</h2><div class="fark" style="max-width:none">Satıştan iade al</div></a>'
            : ''
        }
        ${
          ['admin', 'eczaci'].includes(oturum.kullanici.rol)
            ? `<a class="kart kart-dokun bg-turuncu" href="#/mal-kabul"><h2>Mal kabul</h2><div class="fark" style="max-width:none">Gelen malı okut</div></a>
               <a class="kart kart-dokun bg-krem" href="#/siparisler"><h2>Siparişler</h2><div class="fark" style="max-width:none">Durumları gör</div></a>`
            : ''
        }
      </div>
      <a class="kart kart-dokun bg-yesil" href="#/oneri" style="margin-top:14px"><h2>Akıllı öneriler</h2><div class="fark" style="max-width:none">Stok bitiş tahmini, SKT indirimi, gün sonu özeti</div></a>`
    );
    uyg.querySelectorAll('[data-donem]').forEach((b) =>
      b.addEventListener('click', () => {
        donem = b.dataset.donem;
        yerelYaz('eczanem:donem', donem);
        ozetEkrani();
      })
    );
  }

  // ---------- Ekran: stok ve satis (grafik) ----------
  async function satisEkrani() {
    cerceve('Stok & Satış', 'satis', '<div class="yukleniyor">Yükleniyor…</div>');
    let d;
    try {
      d = await get('/api/mobil/ozet?donem=' + donem, { onbellek: true });
    } catch (e) {
      return cerceve('Stok & Satış', 'satis', hataKutusu(e));
    }
    const maks = Math.max(1, ...d.seri.map((s) => s.toplam));
    let secili = d.seri.length - 1;
    const BG = ['bg-turuncu', 'bg-pembe', 'bg-mavi', 'bg-sari'];
    cerceve(
      'Stok & Satış',
      'satis',
      `${cevrimdisiNot(d)}
      <div class="cipler">${[['gun', 'Gün'], ['hafta', 'Hafta'], ['ay', 'Ay']]
        .map(([k, a]) => `<button class="hap ${donem === k ? 'secili' : ''}" data-donem="${k}">${a}</button>`)
        .join('')}</div>
      <section class="kart bg-mor" aria-label="Satış grafiği">
        <h2 style="font-size:17px;font-weight:600">Toplam satış</h2>
        <div class="tutar" id="g-tutar">${tl(d.toplam)}</div>
        <div class="grafik" id="grafik">${d.seri
          .map(
            (s, i) => `<div class="cubuk-kolon"><button class="cubuk ${i === secili ? 'secili' : ''}" data-i="${i}" aria-label="${esc(s.etiket)}: ${tl(s.toplam)}">
              <span class="dolu" style="height:${Math.max(4, (s.toplam / maks) * 100)}%"></span><span class="balon" ${i === secili ? '' : 'hidden'}>${tlKisa(s.toplam)}</span></button>
              <span class="cubuk-etiket">${esc(s.etiket)}</span></div>`
          )
          .join('')}</div>
      </section>
      <h2 style="font-family:var(--font-baslik);margin:20px 4px 10px">Şubeler</h2>
      <div class="kart-ikili">${d.subeler
        .map(
          (s, i) => `<div class="kart ${BG[i % BG.length]}"><h2 style="font-size:16px">${esc(s.ad)}</h2><div class="tutar" style="font-size:24px">${tl(s.toplam)}</div>
            <div class="fark" style="max-width:none">${s.fark >= 0 ? '+' : '−'}${tl(Math.abs(s.fark))}</div></div>`
        )
        .join('')}</div>`
    );
    uyg.querySelectorAll('[data-donem]').forEach((b) =>
      b.addEventListener('click', () => {
        donem = b.dataset.donem;
        yerelYaz('eczanem:donem', donem);
        satisEkrani();
      })
    );
    $('#grafik').addEventListener('click', (e) => {
      const c = e.target.closest('.cubuk');
      if (!c) return;
      secili = Number(c.dataset.i);
      uyg.querySelectorAll('.cubuk').forEach((x, i) => {
        x.classList.toggle('secili', i === secili);
        $('.balon', x).hidden = i !== secili;
      });
    });
  }

  // ---------- Urun karti (sheet) ----------
  async function urunKarti(ilac, { sayimId = null } = {}) {
    const perde = sayfaAc(`<div class="yukleniyor">Yükleniyor…</div>`);
    let partiler = [];
    let muadil = [];
    try {
      [partiler, muadil] = await Promise.all([
        get(`/api/ilaclar/${ilac.id}/partiler`, { onbellek: true }).catch(() => []),
        ilac.etken_madde ? get(`/api/ilaclar/${ilac.id}/muadiller`).catch(() => []) : []
      ]);
    } catch (e) {}
    const stokRenk = ilac.stok <= 0 ? 'kirmizi' : ilac.stok <= ilac.kritik_stok ? 'sari' : 'yesil';
    $('.sayfa', perde).innerHTML = `<div class="tutamak"></div>
      <h2 style="font-family:var(--font-baslik);font-size:26px;margin:0 0 6px;letter-spacing:-.02em">${esc(ilac.ad)}</h2>
      <p class="alt-yazi" style="margin-bottom:12px">${esc(ilac.etken_madde || ilac.kategori || '')}</p>
      <div class="kart-ikili" style="margin-bottom:14px">
        <div class="kart bg-yesil"><h2>Stok</h2><div class="tutar">${ilac.stok}</div></div>
        <div class="kart bg-sari"><h2>Fiyat</h2><div class="tutar" style="font-size:22px">${tl(ilac.satis_fiyati)}</div></div>
      </div>
      <div class="satir"><div class="ad">Raf<small>${esc(ilac.raf_konumu || 'Belirtilmemiş')}</small></div><span class="rozet ${stokRenk}">${ilac.stok <= 0 ? 'Stok yok' : ilac.stok <= ilac.kritik_stok ? 'Kritik' : 'Yeterli'}</span></div>
      <div class="satir"><div class="ad">Barkod<small>${esc(ilac.barkod || '—')}</small></div></div>
      ${ilac.receteli ? '<div class="satir"><div class="ad">Reçeteli ilaç</div><span class="rozet sari">Reçete</span></div>' : ''}
      ${ilac.gebelik_uyari ? `<div class="satir"><div class="ad">Gebelik/emzirme<small>${ilac.gebelik_uyari === 'kontrendike' ? 'Kontrendike' : 'Dikkatli kullanılmalı'}</small></div><span class="rozet kirmizi">Uyarı</span></div>` : ''}
      ${
        partiler.length
          ? `<h3 style="font-family:var(--font-baslik);margin:14px 0 4px">Partiler</h3>${partiler
              .filter((p) => p.miktar > 0)
              .map((p) => `<div class="satir"><div class="ad">${esc(p.parti_no || 'Partisiz')}<small>SKT ${esc(p.skt || '—')}</small></div><span class="rozet">${p.miktar} adet</span></div>`)
              .join('')}`
          : ''
      }
      ${
        muadil.length
          ? `<h3 style="font-family:var(--font-baslik);margin:14px 0 4px">Muadiller</h3>${muadil
              .slice(0, 6)
              .map((m) => `<div class="satir"><div class="ad">${esc(m.ad)}<small>${tl(m.satis_fiyati)}${m.raf_konumu ? ' · ' + esc(m.raf_konumu) : ''}</small></div><span class="rozet ${m.stok > 0 ? 'yesil' : 'kirmizi'}">${m.stok}</span></div>`)
              .join('')}`
          : ''
      }
      <div style="display:grid;gap:10px;margin-top:18px">
        ${sayimId ? `<button class="hap siyah" id="u-say">Sayıma +1 ekle</button>` : ''}
        <button class="hap" id="u-istek">İstek defterine ekle</button>
        <button class="hap" id="u-kapat">Kapat</button>
      </div>`;
    $('#u-kapat', perde).onclick = () => perde.remove();
    $('#u-istek', perde).onclick = async () => {
      const kisi = window.prompt('Müşteri adı (istek defteri için):');
      if (!kisi) return;
      try {
        const r = await kuyruklaGonder('POST', '/api/istekler', { musteri_adi: kisi, ilac_id: ilac.id, adet: 1 }, `İstek: ${ilac.ad}`);
        if (!r.kuyrukta) toast('İstek defterine eklendi');
        perde.remove();
      } catch (e) {
        toast(e.message);
      }
    };
    const say = $('#u-say', perde);
    if (say) say.onclick = async () => {
      await sayimaEkle(sayimId, ilac);
      perde.remove();
    };
  }

  // ---------- Ekran: urunler ----------
  async function urunlerEkrani(sorgu) {
    const filtre = (sorgu && sorgu.get('filtre')) || '';
    cerceve('Ürünler', 'urunler', `<input class="alan" id="u-ara" type="search" placeholder="Ürün, barkod veya etken madde ara" aria-label="Ara" autocomplete="off" />
      <div class="cipler" style="margin-top:12px">${[['', 'Tümü'], ['kritik', 'Kritik stok'], ['skt', 'SKT yakın']]
        .map(([k, a]) => `<button class="hap ${filtre === k ? 'secili' : ''}" data-filtre="${k}">${a}</button>`)
        .join('')}</div>
      <section class="kart" id="u-liste" style="padding:8px 18px"><div class="yukleniyor">Yükleniyor…</div></section>`);
    let liste = [];
    let uyari = null;
    try {
      const veri = await get('/api/ilaclar', { onbellek: true });
      liste = Array.isArray(veri) ? veri : [];
      if (veri.__onbellekten) $('#u-liste').insertAdjacentHTML('beforebegin', cevrimdisiNot(veri));
      if (filtre === 'skt') uyari = await get('/api/ilaclar/uyarilar', { onbellek: true });
    } catch (e) {
      try {
        const k = yerel('onb:/api/ilaclar', null);
        if (k) liste = k.veri;
      } catch (e2) {}
    }
    const sktIdler = uyari ? new Set((uyari.skt_yaklasan || []).map((x) => x.ilac_id || x.id)) : null;
    const turkceKucuk = (m) => String(m || '').toLocaleLowerCase('tr-TR');
    const ciz = () => {
      const q = turkceKucuk($('#u-ara').value.trim());
      let r = liste;
      if (filtre === 'kritik') r = r.filter((i) => i.stok <= i.kritik_stok);
      if (filtre === 'skt' && sktIdler) r = r.filter((i) => sktIdler.has(i.id));
      if (q) r = r.filter((i) => turkceKucuk(i.ad).includes(q) || (i.barkod || '').includes(q) || turkceKucuk(i.etken_madde).includes(q) || turkceKucuk(i.kategori).includes(q));
      $('#u-liste').innerHTML = r.length
        ? r
            .slice(0, 80)
            .map(
              (i) => `<button class="satir" data-id="${i.id}" style="width:100%;background:none;border:none;border-top:2px dashed rgba(17,17,17,.25);text-align:left;cursor:pointer;font-size:inherit">
                <div class="ad">${esc(i.ad)}<small>${tl(i.satis_fiyati)}${i.raf_konumu ? ' · ' + esc(i.raf_konumu) : ''}</small></div>
                <span class="rozet ${i.stok <= 0 ? 'kirmizi' : i.stok <= i.kritik_stok ? 'sari' : 'yesil'}">${i.stok}</span></button>`
            )
            .join('')
        : `<div class="bos">${MASKOT}<p>Sonuç bulunamadı</p></div>`;
    };
    ciz();
    $('#u-ara').addEventListener('input', ciz);
    uyg.querySelectorAll('[data-filtre]').forEach((b) => b.addEventListener('click', () => (location.hash = '#/urunler' + (b.dataset.filtre ? '?filtre=' + b.dataset.filtre : ''))));
    $('#u-liste').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) urunKarti(liste.find((i) => i.id === Number(b.dataset.id)));
    });
  }

  // Kamera: yerel zxing (EAN-13, Code 128, QR, GS1 DataMatrix) — iOS WebView dahil her yerde calisir.
  // kamera: kapsayici eleman, okundu(metin): her okumada cagrilir. Donus: durdurma fonksiyonu (kamera yoksa null).
  async function kameraBaslat(kamera, okundu) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.ZXing) {
      kamera.innerHTML = '<div>Bu cihazda kamera kullanılamıyor. Barkodu elle yazabilirsiniz.</div>';
      return null;
    }
    try {
      const ipuclari = new Map();
      ipuclari.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.DATA_MATRIX]);
      ipuclari.set(ZXing.DecodeHintType.TRY_HARDER, true);
      const okuyucu = new ZXing.BrowserMultiFormatReader(ipuclari, 300);
      kamera.className = 'kamera';
      kamera.innerHTML = '<video playsinline muted></video><div class="cerceve"></div><div class="tarama-cizgi"></div><div class="kamera-mesaj">Barkodu çerçeveye getirin</div>';
      const video = $('video', kamera);
      await okuyucu.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (sonuc) => {
        if (sonuc) okundu(sonuc.getText());
      });
      return () => okuyucu.reset();
    } catch (e) {
      kamera.className = 'kamera kapali';
      kamera.innerHTML = `<div>Kamera açılamadı (${esc(e.name === 'NotAllowedError' ? 'izin verilmedi' : e.message)}). Barkodu elle yazabilirsiniz.</div>`;
      return null;
    }
  }

  // ---------- Tarama ----------
  let tarayici = null; // { dur() }
  function taramayiDurdur() {
    if (tarayici) tarayici.dur();
    tarayici = null;
  }
  let sayimModu = null; // { id }
  async function sayimaEkle(sayimId, ilac) {
    const r = await kuyruklaGonder('PUT', `/api/sayimlar/${sayimId}/kalemler`, { ilac_id: ilac.id, sayilan: 1, arti: true }, `Sayım +1: ${ilac.ad}`);
    toast(r.kuyrukta ? 'Sıraya alındı' : `${ilac.ad}: sayılan ${r.sayilan ?? '+1'}`);
  }

  async function barkodCoz(metin) {
    const t = String(metin).trim();
    const karekodMu = /^\][A-Za-z]\d/.test(t) || t.includes('\x1d') || t.startsWith('(01)') || /^01\d{14}(10|11|17|21)/.test(t);
    if (karekodMu) {
      const r = await get('/api/ilaclar/karekod?kod=' + encodeURIComponent(t));
      return { ilac: r.ilac, ek: r };
    }
    const liste = await get('/api/ilaclar?q=' + encodeURIComponent(t), { onbellek: true });
    const tam = liste.find((i) => i.barkod === t) || (liste.length === 1 ? liste[0] : null);
    return { ilac: tam, ek: null, liste };
  }

  async function taraEkrani() {
    taramayiDurdur();
    const yonetici = ['admin', 'eczaci'].includes(oturum.kullanici.rol);
    cerceve(
      'Tara',
      'tara',
      `<div class="cipler"><button class="hap secili" data-mod="sorgu">Sorgu</button>${yonetici ? '<button class="hap" data-mod="sayim">Sayım</button>' : ''}</div>
      <div id="sayim-bilgi"></div>
      <div class="kamera kapali" id="kamera"><div>Kamera hazırlanıyor…</div></div>
      <form id="elle-form" style="display:flex;gap:10px">
        <input class="alan" id="elle" inputmode="search" placeholder="Barkod yazın veya karekod yapıştırın" aria-label="Barkod" autocomplete="off" />
        <button class="yuvarlak" style="background:var(--yesil);width:56px;height:56px" type="submit" aria-label="Ara">${svg('ara')}</button>
      </form>`
    );
    let mod = 'sorgu';
    let sonOkunan = '';
    let sonZaman = 0;

    const modGuncelle = async () => {
      uyg.querySelectorAll('[data-mod]').forEach((b) => b.classList.toggle('secili', b.dataset.mod === mod));
      const kutu = $('#sayim-bilgi');
      if (mod !== 'sayim') {
        sayimModu = null;
        kutu.innerHTML = '';
        return;
      }
      try {
        const liste = await get('/api/sayimlar');
        let acik = liste.find((s) => s.durum === 'acik');
        if (!acik) {
          if (!window.confirm('Açık sayım yok. Yeni bir sayım başlatılsın mı?')) {
            mod = 'sorgu';
            return modGuncelle();
          }
          acik = await post('/api/sayimlar', { kapsam: 'hepsi', aciklama: 'Mobil sayım' });
        }
        sayimModu = { id: acik.id };
        kutu.innerHTML = `<div class="hata-kutu" style="background:var(--yesil)">Sayım #${acik.id} açık. Okuttuğunuz her ürün +1 sayılır. Bitirmek için bilgisayardan "Sayımı tamamla".</div>`;
      } catch (e) {
        toast(e.message);
        mod = 'sorgu';
        modGuncelle();
      }
    };
    uyg.querySelectorAll('[data-mod]').forEach((b) =>
      b.addEventListener('click', () => {
        mod = b.dataset.mod;
        modGuncelle();
      })
    );

    const okundu = async (metin) => {
      const simdi = Date.now();
      if (metin === sonOkunan && simdi - sonZaman < 2500) return;
      sonOkunan = metin;
      sonZaman = simdi;
      if (navigator.vibrate) navigator.vibrate(40);
      try {
        const { ilac, liste } = await barkodCoz(metin);
        if (!ilac) {
          if (liste && liste.length) {
            const perde = sayfaAc(`<h2 style="font-family:var(--font-baslik)">Eşleşenler</h2>${liste
              .slice(0, 8)
              .map((i) => `<button class="satir" data-id="${i.id}" style="width:100%;background:none;border:none;text-align:left;font-size:inherit;cursor:pointer"><div class="ad">${esc(i.ad)}<small>${tl(i.satis_fiyati)}</small></div><span class="rozet">${i.stok}</span></button>`)
              .join('')}`);
            perde.addEventListener('click', (e) => {
              const b = e.target.closest('[data-id]');
              if (b) {
                perde.remove();
                urunKarti(liste.find((i) => i.id === Number(b.dataset.id)), { sayimId: sayimModu && sayimModu.id });
              }
            });
          } else toast('Ürün bulunamadı');
          return;
        }
        if (sayimModu) {
          await sayimaEkle(sayimModu.id, ilac);
        } else {
          urunKarti(ilac, { sayimId: null });
        }
      } catch (e) {
        toast(e.message);
      }
    };

    $('#elle-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#elle').value.trim();
      if (v) {
        sonOkunan = '';
        okundu(v);
        $('#elle').value = '';
      }
    });

    // Kamera: yerel zxing (EAN-13, Code 128, QR, GS1 DataMatrix) — iOS WebView dahil her yerde calisir
    const dur = await kameraBaslat($('#kamera'), okundu);
    if (dur) tarayici = { dur };
  }

  // ---------- Ekran: bildirimler ----------
  const SEVIYE_RENK = { danger: 'bg-mercan', warn: 'bg-sari', info: 'bg-mavi', ok: 'bg-yesil' };
  async function bildirimEkrani() {
    cerceve('Bildirimler', 'bildirim', '<div class="yukleniyor">Yükleniyor…</div>');
    let d;
    try {
      d = await get('/api/bildirim-merkezi', { onbellek: true });
    } catch (e) {
      return cerceve('Bildirimler', 'bildirim', hataKutusu(e));
    }
    bildirimSayisi = d.toplam;
    cerceve(
      'Bildirimler',
      'bildirim',
      `${cevrimdisiNot(d)}
      <button class="hap siyah" id="sicaklik-ac" style="margin-bottom:16px">❄️ Soğuk zincir ölçümü gir</button>
      ${
        d.ogeler.length
          ? d.ogeler
              .map(
                (o) => `<div class="kart ${SEVIYE_RENK[o.seviye] || 'bg-krem'}" style="padding:14px 16px"><div style="display:flex;gap:12px;align-items:center">
                  <div style="flex:1"><h2 style="font-size:17px;margin:0 0 2px">${esc(o.baslik)}</h2><div style="font-weight:600;font-size:13.5px">${esc(o.aciklama)}</div></div>
                  <span class="rozet" style="font-size:16px">${o.sayi}</span></div></div>`
              )
              .join('')
          : `<div class="bos">${MASKOT}<p>Her şey yolunda! Bekleyen uyarı yok.</p></div>`
      }`
    );
    $('#sicaklik-ac').addEventListener('click', () => {
      const perde = sayfaAc(`<h2 style="font-family:var(--font-baslik);margin:0 0 12px">Soğuk zincir ölçümü</h2>
        <form id="sic-form"><label class="etiket" for="sic-d">Dolap</label><input class="alan" id="sic-d" value="Buzdolabı" />
        <label class="etiket" for="sic-t" style="margin-top:12px">Sıcaklık (°C)</label><input class="alan" id="sic-t" type="number" step="0.1" inputmode="decimal" required />
        <p class="alt-yazi" style="margin-top:10px">Kabul edilen aralık 2–8 °C.</p>
        <button class="hap siyah" type="submit">Kaydet</button></form>`);
      $('#sic-form', perde).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const r = await kuyruklaGonder('POST', '/api/kalite/sicaklik', { dolap: $('#sic-d', perde).value, sicaklik: Number($('#sic-t', perde).value) }, 'Sıcaklık ölçümü');
          toast(r.kuyrukta ? 'Sıraya alındı' : r.aralik_disi ? `Dikkat: ${r.sicaklik} °C aralık dışında!` : 'Ölçüm kaydedildi');
          perde.remove();
          if (!r.kuyrukta) bildirimEkrani();
        } catch (err) {
          toast(err.message);
        }
      });
    });
  }

  // ---------- Ekran: profil ----------
  async function profilEkrani() {
    const u = oturum.kullanici;
    const bekleyen = kuyrukOku();
    cerceve(
      'Profil',
      'profil',
      `<section class="kart bg-krem" style="text-align:center">
        <span class="yuvarlak" style="background:var(--yesil);width:84px;height:84px;font-size:28px;margin:0 auto 10px;display:flex;pointer-events:none">${esc(baslar(u.ad_soyad))}</span>
        <h2 style="margin:0">${esc(u.ad_soyad)}</h2><p class="alt-yazi" style="margin:4px 0 0">${esc(u.rol)} · ${esc(u.kullanici_adi)}</p>
      </section>
      <section class="kart">
        <div class="satir"><div class="ad">Bekleyen kayıtlar<small>Bağlantı gelince gönderilir</small></div><span class="rozet ${bekleyen.length ? 'sari' : 'yesil'}" id="kuyruk-rozet">${bekleyen.length}</span></div>
        <div class="satir"><div class="ad">Bağlantı<small>${cevrimiciMi ? 'Sunucuya bağlı' : 'Çevrimdışı'}</small></div><span class="rozet ${cevrimiciMi ? 'yesil' : 'kirmizi'}">${cevrimiciMi ? 'Açık' : 'Kapalı'}</span></div>
        <div class="satir"><div class="ad">Sürüm<small>Eczam Mobil 1.0</small></div></div>
      </section>
      <div style="display:grid;gap:12px">
        ${bekleyen.length ? '<button class="hap" id="p-gonder">Bekleyenleri şimdi gönder</button>' : ''}
        <div class="cipler" role="group" aria-label="Dil"><button class="hap ${window.EczamDil && EczamDil.dil === 'tr' ? 'secili' : ''}" data-dil="tr">Türkçe</button><button class="hap ${window.EczamDil && EczamDil.dil === 'en' ? 'secili' : ''}" data-dil="en">English</button></div>
        <a class="hap" style="text-align:center;text-decoration:none" href="/gizlilik.html">Gizlilik politikası</a>
        <button class="hap" id="p-sifre">Şifremi değiştir</button>
        ${/EczanemApp\//.test(navigator.userAgent) ? '<button class="hap" id="p-sunucu">Sunucuyu değiştir</button>' : ''}
        <button class="hap siyah" id="p-cikis">Çıkış yap</button>
        <button class="hap" id="p-sil" style="background:var(--mercan)">Hesabım ve veri silme</button>
      </div>`,
      { geri: true }
    );
    uyg.querySelectorAll('[data-dil]').forEach((b) => (b.onclick = () => window.EczamDil && EczamDil.ayarla(b.dataset.dil)));
    const g = $('#p-gonder');
    if (g) g.onclick = async () => { await kuyruguBosalt(); profilEkrani(); };
    $('#p-cikis').onclick = async () => {
      taramayiDurdur();
      try { await post('/api/auth/logout'); } catch (e) {}
      oturum.kullanici = null;
      location.hash = '#/giris';
    };
    const sunucuDugme = $('#p-sunucu');
    if (sunucuDugme) {
      // Yerel kabuktaki baglanti ekranina don (kayitli adres silinir)
      sunucuDugme.onclick = () => {
        if (window.confirm('Bu cihazdaki sunucu bağlantısı kaldırılsın ve farklı bir eczane sunucusu seçilsin mi?')) {
          location.href = 'capacitor://localhost/index.html?degistir=1';
        }
      };
    }
    $('#p-sifre').onclick = () => {
      const perde = sayfaAc(`<h2 style="font-family:var(--font-baslik);margin:0 0 12px">Şifre değiştir</h2>
        <form id="ps-form"><label class="etiket" for="ps-m">Mevcut şifre</label><input class="alan" id="ps-m" type="password" autocomplete="current-password" required />
        <label class="etiket" for="ps-y" style="margin-top:12px">Yeni şifre</label><input class="alan" id="ps-y" type="password" autocomplete="new-password" minlength="8" required />
        <button class="hap siyah" style="margin-top:16px" type="submit">Değiştir</button></form>`);
      $('#ps-form', perde).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await post('/api/auth/sifre-degistir', { mevcut_sifre: $('#ps-m', perde).value, yeni_sifre: $('#ps-y', perde).value });
          perde.remove();
          toast('Şifre değiştirildi');
        } catch (err) {
          toast(err.message);
        }
      });
    };
    $('#p-sil').onclick = () => {
      sayfaAc(`<h2 style="font-family:var(--font-baslik);margin:0 0 10px">Hesap ve veri silme</h2>
        <p style="font-weight:600;line-height:1.5">Eczam Mobil, hesabınızı eczanenizin yöneticisi yönetir. Hesabınızın ve kişisel verilerinizin silinmesi için eczane yöneticinize başvurun (Web uygulaması → Kullanıcılar). Yönetici hesabı siler; satış kayıtları yasal saklama süresi boyunca anonim biçimde tutulur.</p>
        <a class="hap siyah" style="display:block;text-align:center;text-decoration:none" href="/gizlilik.html">Gizlilik politikasını oku</a>`);
    };
  }

  // ---------- Yonlendirme ----------
  const EKRANLAR = { ozet: ozetEkrani, satis: satisEkrani, tara: taraEkrani, urunler: urunlerEkrani, bildirim: bildirimEkrani, profil: profilEkrani };
  // Islem ekranlari (mobil-islemler.js) cekirdegin yardimcilariyla kaydolur
  const ekranTemizle = [];
  if (typeof window.EczamEklenti === 'function') {
    Object.assign(
      EKRANLAR,
      window.EczamEklenti({ $, esc, tl, svg, get, post, put, kuyruklaGonder, toast, sayfaAc, cerceve, hataKutusu, cevrimdisiNot, oturum, uyg, urunKarti, barkodCoz, kameraBaslat, yerel, yerelYaz, ekranTemizle })
    );
  }
  async function yonlendir() {
    taramayiDurdur();
    ekranTemizle.forEach((f) => f());
    document.querySelectorAll('.perde').forEach((p) => p.remove());
    const [yol, sorgu] = location.hash.replace(/^#\/?/, '').split('?');
    const ad = yol || 'ozet';
    if (ad === 'giris') return girisEkrani();
    if (!oturum.kullanici) {
      try {
        const me = await get('/api/auth/me');
        if (me.user.sifre_degistirilmeli) {
          oturum.kullanici = me.user;
          return girisEkrani(null, true);
        }
        oturum.kullanici = me.user;
      } catch (e) {
        if (e.cevrimdisi) {
          // Cevrimdisi iken son bilinen kullaniciyla onbellekteki ekranlar acilabilsin
          const son = yerel('eczanem:kullanici', null);
          if (son) oturum.kullanici = son;
          else return girisEkrani('Sunucuya ulaşılamıyor');
        } else return girisEkrani();
      }
    }
    yerelYaz('eczanem:kullanici', oturum.kullanici);
    kuyruguBosalt();
    (EKRANLAR[ad] || ozetEkrani)(new URLSearchParams(sorgu || ''));
    // Bildirim rozeti icin sayiyi arka planda tazele
    if (ad !== 'bildirim') {
      get('/api/bildirim-merkezi')
        .then((d) => {
          if (d.toplam !== bildirimSayisi) {
            bildirimSayisi = d.toplam;
            gezinmeCiz(ad);
          }
        })
        .catch(() => {});
    }
  }
  window.addEventListener('hashchange', yonlendir);
  yonlendir();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/mobil/sw.js', { scope: '/mobil/' }).catch(() => {});
  }
})();
