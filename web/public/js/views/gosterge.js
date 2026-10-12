// Gosterge (Ana Sayfa yeni gorunumu): koyu cam zemin uzerinde animasyonlu kartlar.
// Kartlar: gunun cirosu (saatlik cubuklar), satis adedi (14 gunluk cizgi), aylik hedef (yarim daire),
// stok uyarilari; buyuk satis grafigi (14 gun / 12 ay), haftanin yildizi, hizli islemler;
// sag panelde profil, takvim (nobet gunleri) ve yapilacaklar.
(function () {
  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const GUNLER = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
  const ROL = { admin: 'Yönetici', eczaci: 'Eczacı', kasiyer: 'Kasiyer' };
  const NS = 'http://www.w3.org/2000/svg';
  const azHareket = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (s) => UI.esc(s == null ? '' : String(s));
  const tlKisa = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1000) return (v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'b ₺';
    return Math.round(v).toLocaleString('tr-TR') + ' ₺';
  };
  const selam = () => {
    const s = new Date().getHours();
    return s < 6 ? 'İyi geceler' : s < 12 ? 'Günaydın' : s < 18 ? 'İyi günler' : 'İyi akşamlar';
  };
  const basHarf = (ad) =>
    String(ad || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toLocaleUpperCase('tr-TR'))
      .join('');

  // Sayilar 0'dan hedefe yumusakca sayar
  function sayac(kok) {
    kok.querySelectorAll('[data-sayi]').forEach((el) => {
      const hedef = Number(el.dataset.sayi) || 0;
      const bicim = el.dataset.bicim;
      const yaz = (v) => {
        el.textContent = bicim === 'tl' ? UI.tl(v) : bicim === 'yuzde' ? '%' + Math.round(v) : Math.round(v).toLocaleString('tr-TR');
      };
      if (azHareket() || !hedef) return yaz(hedef);
      const bas = performance.now();
      const sure = 900;
      const adim = (t) => {
        const k = Math.min(1, (t - bas) / sure);
        yaz(hedef * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(adim);
      };
      requestAnimationFrame(adim);
    });
  }

  // Mini cubuk grafik (tek seri): her cubugun ustune gelince deger gorunur
  function miniCubuk(veri, renk, etiket) {
    const g = 132;
    const y = 40;
    const en = Math.max(1, ...veri.map((d) => d.deger));
    const adim = g / veri.length;
    const genislik = Math.max(3, Math.min(6, adim - 3));
    const cubuklar = veri
      .map((d, i) => {
        const h = d.deger > 0 ? Math.max(4, (d.deger / en) * (y - 4)) : 2;
        const x = i * adim + (adim - genislik) / 2;
        return `<g class="gst-mc"><rect x="${x - 2}" y="0" width="${genislik + 4}" height="${y}" fill="transparent"><title>${esc(d.etiket)}</title></rect>
          <rect class="gst-cubuk" style="--g:${i * 30}ms" x="${x}" y="${y - h}" width="${genislik}" height="${h}" rx="${genislik / 2}" fill="${d.deger > 0 ? renk : 'rgba(17,17,17,.12)'}"><title>${esc(d.etiket)}</title></rect></g>`;
      })
      .join('');
    return `<svg class="gst-mini" viewBox="0 0 ${g} ${y}" role="img" aria-label="${esc(etiket)}">${cubuklar}</svg>`;
  }

  // Iki yatay cubuk (etiketli): stok uyarilari
  function ikiCubuk(satirlar, renk) {
    const en = Math.max(1, ...satirlar.map((s) => s[1]));
    return `<div class="gst-mini gst-yatay">${satirlar
      .map(
        ([ad, v], i) => `<div title="${esc(ad)}: ${v}"><small>${esc(ad)}</small><span><i class="gst-yatay-dolu" style="--g:${i * 120}ms;width:${v ? Math.max(8, (v / en) * 100) : 0}%;background:${renk}"></i></span></div>`
      )
      .join('')}</div>`;
  }

  // Mini cizgi (son 14 gun satis adedi)
  function miniCizgi(degerler, renk, etiket) {
    const g = 132;
    const y = 40;
    const en = Math.max(1, ...degerler);
    const nokta = degerler.map((v, i) => [(i / Math.max(1, degerler.length - 1)) * (g - 6) + 3, y - 4 - (v / en) * (y - 10)]);
    const d = nokta.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const son = nokta[nokta.length - 1];
    return `<svg class="gst-mini" viewBox="0 0 ${g} ${y}" role="img" aria-label="${esc(etiket)}">
      <path class="gst-ciz" d="${d}" fill="none" stroke="${renk}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pathLength="1" />
      <circle cx="${son[0]}" cy="${son[1]}" r="4" fill="${renk}" stroke="#fff" stroke-width="2" class="gst-nokta" />
    </svg>`;
  }

  // Yarim daire gosterge (aylik hedef yuzdesi)
  function yarimDaire(oran, renk) {
    const r = 26;
    const uz = Math.PI * r;
    const dolu = Math.max(0, Math.min(1, oran));
    return `<svg class="gst-mini gst-yay" viewBox="0 0 64 36" role="img" aria-label="Hedefin yüzde ${Math.round(oran * 100)}'i">
      <path d="M6 32 A${r} ${r} 0 0 1 58 32" fill="none" stroke="rgba(17,17,17,.1)" stroke-width="7" stroke-linecap="round" />
      <path class="gst-yay-dolu" d="M6 32 A${r} ${r} 0 0 1 58 32" fill="none" stroke="${renk}" stroke-width="7" stroke-linecap="round"
        style="--uz:${uz.toFixed(1)};--dolu:${(uz * (1 - dolu)).toFixed(1)}" stroke-dasharray="${uz.toFixed(1)}" />
    </svg>`;
  }

  // Buyuk satis grafigi: alan + cizgi, en yuksek noktada etiket, ustune gelince dikey cizgi ve ipucu
  function buyukGrafik(kutu, seri) {
    const W = 640;
    const H = 210;
    const sol = 46;
    const sag = 12;
    const ust = 28;
    const alt = 26;
    const en = Math.max(1, ...seri.map((s) => s.deger));
    const tavan = Math.ceil(en / Math.pow(10, Math.floor(Math.log10(en)))) * Math.pow(10, Math.floor(Math.log10(en)));
    const x = (i) => sol + (i / Math.max(1, seri.length - 1)) * (W - sol - sag);
    const y = (v) => ust + (1 - v / tavan) * (H - ust - alt);
    const nok = seri.map((s, i) => [x(i), y(s.deger)]);
    // Yumusak egri (Catmull-Rom -> Bezier)
    let d = `M${nok[0][0]} ${nok[0][1]}`;
    for (let i = 0; i < nok.length - 1; i++) {
      const p0 = nok[i - 1] || nok[i];
      const p1 = nok[i];
      const p2 = nok[i + 1];
      const p3 = nok[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(H - alt, p1[1] + (p2[1] - p0[1]) / 6)];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(H - alt, p2[1] - (p3[1] - p1[1]) / 6)];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    const alan = `${d} L${nok[nok.length - 1][0]} ${H - alt} L${nok[0][0]} ${H - alt} Z`;
    const zirve = seri.reduce((m, s, i) => (s.deger > seri[m].deger ? i : m), 0);
    const izgara = [0, 0.25, 0.5, 0.75, 1]
      .map((k) => {
        const yy = y(tavan * k);
        return `<line x1="${sol}" x2="${W - sag}" y1="${yy}" y2="${yy}" class="gst-izgara" /><text x="${sol - 8}" y="${yy + 4}" class="gst-eksen" text-anchor="end">${esc(tlKisa(tavan * k).replace(' ₺', ''))}</text>`;
      })
      .join('');
    const adimEtiket = Math.ceil(seri.length / 8);
    const xEtiket = seri
      .map((s, i) => (i % adimEtiket === 0 || i === seri.length - 1 ? `<text x="${x(i)}" y="${H - 6}" class="gst-eksen" text-anchor="middle">${esc(s.kisa)}</text>` : ''))
      .join('');
    const zx = nok[zirve][0];
    const zy = nok[zirve][1];
    const etiketMetin = tlKisa(seri[zirve].deger);
    const etiketG = etiketMetin.length * 6.6 + 18;
    kutu.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="gst-grafik" role="img" aria-label="Satış tutarı grafiği">
        <defs><linearGradient id="gst-alan" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f26b1d" stop-opacity=".28" /><stop offset="1" stop-color="#f26b1d" stop-opacity="0" /></linearGradient></defs>
        ${izgara}${xEtiket}
        <path d="${alan}" fill="url(#gst-alan)" class="gst-alan" />
        <path d="${d}" fill="none" stroke="#f26b1d" stroke-width="2.5" stroke-linecap="round" class="gst-ciz" pathLength="1" />
        ${seri[zirve].deger > 0 ? `<g class="gst-zirve"><line x1="${zx}" x2="${zx}" y1="${zy}" y2="${H - alt}" stroke="#f26b1d" stroke-dasharray="3 4" stroke-opacity=".5" />
          <rect x="${Math.min(W - sag - etiketG, Math.max(sol, zx - etiketG / 2))}" y="${Math.max(2, zy - 30)}" width="${etiketG}" height="22" rx="11" fill="#fff" stroke="#f26b1d" stroke-width="1.5" />
          <text x="${Math.min(W - sag - etiketG / 2, Math.max(sol + etiketG / 2, zx))}" y="${Math.max(2, zy - 30) + 15}" text-anchor="middle" class="gst-zirve-metin">${esc(etiketMetin)}</text>
          <circle cx="${zx}" cy="${zy}" r="5" fill="#f26b1d" stroke="#fff" stroke-width="2.5" /></g>` : ''}
        <g class="gst-imlec" hidden><line y1="${ust}" y2="${H - alt}" stroke="rgba(17,17,17,.35)" /><circle r="5" fill="#fff" stroke="#f26b1d" stroke-width="2.5" /></g>
        <rect x="${sol}" y="0" width="${W - sol - sag}" height="${H}" fill="transparent" class="gst-dokunma" />
      </svg><div class="gst-ipucu" hidden></div>`;
    const svg = kutu.querySelector('svg');
    const imlec = svg.querySelector('.gst-imlec');
    const ipucu = kutu.querySelector('.gst-ipucu');
    const goster = (clientX) => {
      const r = svg.getBoundingClientRect();
      const vx = ((clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(seri.length - 1, Math.round(((vx - sol) / (W - sol - sag)) * (seri.length - 1))));
      const [px, py] = nok[i];
      imlec.hidden = false;
      imlec.querySelector('line').setAttribute('x1', px);
      imlec.querySelector('line').setAttribute('x2', px);
      imlec.querySelector('circle').setAttribute('cx', px);
      imlec.querySelector('circle').setAttribute('cy', py);
      ipucu.hidden = false;
      ipucu.innerHTML = `<b>${esc(seri[i].uzun)}</b><span>${UI.tl(seri[i].deger)}</span><small>${seri[i].adet} satış</small>`;
      const sx = (px / W) * r.width;
      ipucu.style.left = Math.min(r.width - 150, Math.max(0, sx - 70)) + 'px';
      ipucu.style.top = Math.max(0, (py / H) * r.height - 76) + 'px';
    };
    const gizle = () => {
      imlec.hidden = true;
      ipucu.hidden = true;
    };
    const dokunma = svg.querySelector('.gst-dokunma');
    dokunma.addEventListener('mousemove', (e) => goster(e.clientX));
    dokunma.addEventListener('mouseleave', gizle);
    dokunma.addEventListener('touchstart', (e) => goster(e.touches[0].clientX), { passive: true });
    dokunma.addEventListener('touchmove', (e) => goster(e.touches[0].clientX), { passive: true });
  }

  function takvimHtml(yil, ay, nobetGunleri) {
    const ilk = new Date(yil, ay, 1);
    const gunSayisi = new Date(yil, ay + 1, 0).getDate();
    const bosluk = (ilk.getDay() + 6) % 7; // Pazartesi basli
    const bugun = new Date();
    const hucreler = [];
    for (let i = 0; i < bosluk; i++) hucreler.push('<span></span>');
    for (let g = 1; g <= gunSayisi; g++) {
      const tarih = `${yil}-${String(ay + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
      const bugunMu = bugun.getFullYear() === yil && bugun.getMonth() === ay && bugun.getDate() === g;
      const nobet = nobetGunleri.has(tarih);
      const sinif = bugunMu ? 'bugun' : nobet ? 'nobet' : '';
      hucreler.push(`<span class="${sinif}" title="${nobet ? 'Nöbet günü' : ''}${bugunMu ? (nobet ? ' · ' : '') + 'Bugün' : ''}">${g}</span>`);
    }
    return `<div class="gst-takvim-gunler">${GUNLER.map((d) => `<b>${d}</b>`).join('')}</div><div class="gst-takvim-izgara">${hucreler.join('')}</div>`;
  }

  async function takvimCiz(panel, yil, ay) {
    const ayStr = `${yil}-${String(ay + 1).padStart(2, '0')}`;
    const nobetler = await Api.get('/api/nobetler?ay=' + ayStr).catch(() => []);
    const gunler = new Set(nobetler.map((n) => n.tarih));
    panel.querySelector('#gst-ay-ad').textContent = `${AYLAR[ay]} ${yil}`;
    panel.querySelector('#gst-takvim').innerHTML = takvimHtml(yil, ay, gunler);
  }

  async function render(container) {
    container.innerHTML = '<div class="gst gst-yukleniyor"><div class="gst-donen" aria-label="Yükleniyor"></div></div>';
    const yonetici = CURRENT_USER.rol === 'admin' || CURRENT_USER.rol === 'eczaci';
    const [ozet, uyarilar, gorevler, hedef, ekip] = await Promise.all([
      Api.get('/api/satislar/panel-ozet'),
      Api.get('/api/ilaclar/uyarilar').catch(() => ({ kritik_stok: [], skt_yaklasan: [] })),
      Api.get('/api/gorevler?durum=bekliyor').catch(() => []),
      Api.get('/api/hedefler/aktif').catch(() => null),
      Api.get('/api/vardiyalar/bugun').catch(() => [])
    ]);

    const g = ozet.gunluk;
    const bugun = g[g.length - 1];
    const dun = g[g.length - 2] || { toplam: 0, adet: 0 };
    const degisim = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
    const ciroDegisim = degisim(bugun.toplam, dun.toplam);
    const adetDegisim = degisim(bugun.adet, dun.adet);
    const hedefOran = hedef && hedef.hedef ? hedef.gerceklesen / hedef.hedef : null;
    const kritik = uyarilar.kritik_stok.length;
    const skt = uyarilar.skt_yaklasan.length;
    const calisan = ekip.filter((v) => v.tip === 'calisma').length;
    const ilkAd = String(CURRENT_USER.ad_soyad || CURRENT_USER.kullanici_adi || '').split(/\s+/)[0];
    const degisimRozet = (v) =>
      v == null ? '<small class="gst-not">dün satış yok</small>' : `<small class="gst-not ${v >= 0 ? 'artis' : 'azalis'}">${v >= 0 ? '▲' : '▼'} %${Math.abs(v).toLocaleString('tr-TR')} düne göre</small>`;

    const kart = (i, baslik, ikon, deger, alt, gorsel) => `
      <article class="gst-kart gst-gir" style="--i:${i}">
        <header><h3>${baslik}</h3><span class="gst-kart-ikon">${ikon}</span></header>
        <div class="gst-kart-govde"><div><div class="gst-deger">${deger}</div>${alt}</div>${gorsel}</div>
      </article>`;

    const saatVeri = ozet.saatlik.map((s) => ({ deger: s.toplam, etiket: `${String(s.saat).padStart(2, '0')}:00 · ${UI.tl(s.toplam)} · ${s.adet} satış` }));
    const yildiz = ozet.yildiz;

    container.innerHTML = `
    <div class="gst">
      <div class="gst-zemin" aria-hidden="true"><i></i><i></i><i></i></div>
      <section class="gst-ana gst-cam">
        <header class="gst-ust gst-gir" style="--i:0">
          <div>
            <h2>${selam()}, ${esc(ilkAd)} <span class="gst-el" aria-hidden="true">👋</span></h2>
            <p>Bugün eczanede neler oluyor, birlikte bakalım.</p>
          </div>
          <form class="gst-ara" id="gst-ara"><span aria-hidden="true">⌕</span><input id="gst-ara-girdi" placeholder="İlaç, barkod veya müşteri ara…" autocomplete="off" /></form>
        </header>

        <div class="gst-kartlar">
          ${kart(1, 'Bugünkü ciro', '₺', `<span data-sayi="${bugun.toplam}" data-bicim="tl">0</span>`, degisimRozet(ciroDegisim), miniCubuk(saatVeri, '#f26b1d', 'Bugünkü saatlik ciro'))}
          ${kart(2, 'Satış', '🧾', `<span data-sayi="${bugun.adet}">0</span> <small>adet</small>`, degisimRozet(adetDegisim), miniCizgi(g.map((d) => d.adet), '#e5484d', 'Son 14 gün satış adedi'))}
          ${kart(
            3,
            'Aylık hedef',
            '🎯',
            hedefOran == null ? '<span class="gst-yok">Hedef yok</span>' : `<span data-sayi="${Math.round(hedefOran * 100)}" data-bicim="yuzde">%0</span>`,
            hedefOran == null ? `<small class="gst-not">${yonetici ? '<a href="#analiz">Hedef belirle</a>' : 'Yönetici belirler'}</small>` : `<small class="gst-not">${UI.tl(hedef.gerceklesen)} / ${UI.tl(hedef.hedef)}</small>`,
            yarimDaire(hedefOran || 0, '#22a55a')
          )}
          ${kart(
            4,
            'Stok uyarıları',
            '⚠',
            `<span data-sayi="${kritik + skt}">0</span>`,
            `<small class="gst-not"><a href="#ilaclar">${kritik} kritik stok</a> · <a href="#depo-iade">${skt} SKT yakın</a></small>`,
            ikiCubuk([['Kritik', kritik], ['SKT', skt]], '#3b6fe0')
          )}
        </div>

        <div class="gst-orta">
          <article class="gst-kart gst-takip gst-gir" style="--i:5">
            <header><h3>Satış takibi</h3>
              <div class="gst-secim" role="tablist" aria-label="Dönem">
                <button type="button" role="tab" data-donem="gun" class="aktif" aria-selected="true">14 gün</button>
                <button type="button" role="tab" data-donem="ay" aria-selected="false">12 ay</button>
              </div>
            </header>
            <div class="gst-grafik-kutu" id="gst-grafik"></div>
          </article>
          <a class="gst-yildiz gst-gir" style="--i:6" href="#ilaclar">
            <div class="gst-yildiz-gorsel" aria-hidden="true">
              <svg viewBox="0 0 120 120"><defs><linearGradient id="gst-sise" x1="0" x2="1"><stop offset="0" stop-color="#ffb37a"/><stop offset="1" stop-color="#f26b1d"/></linearGradient></defs>
                <rect x="38" y="22" width="44" height="14" rx="5" fill="#fff" opacity=".9"/><rect x="30" y="36" width="60" height="70" rx="16" fill="url(#gst-sise)"/>
                <rect x="40" y="56" width="40" height="26" rx="6" fill="#fff" opacity=".85"/><path d="M60 62v14M53 69h14" stroke="#f26b1d" stroke-width="4" stroke-linecap="round"/></svg>
            </div>
            <div class="gst-yildiz-metin">
              <small>Haftanın yıldızı</small>
              <b>${yildiz ? esc(yildiz.ad) : 'Henüz satış yok'}</b>
              ${yildiz ? `<span><em data-sayi="${yildiz.adet}">0</em> adet · ${esc(tlKisa(yildiz.ciro))}</span><span class="gst-etiket">${esc(yildiz.kategori || 'Ürün')}</span>` : '<span>Son 7 günün en çok satanı burada görünür</span>'}
            </div>
          </a>
        </div>

        <div class="gst-bolum-baslik gst-gir" style="--i:7"><h3>Hızlı işlemler</h3><a href="#gorevler">tümü</a></div>
        <div class="gst-islemler">
          ${[
            ['#satis', 'Satış başlat', 'Barkod okut, sepete ekle', 'Kasa', '🛒', ''],
            ['#recete-oku', 'Reçete oku', 'Fotoğraftan ilaçları bul', 'Yeni', '📷', 'vurgu'],
            ['#mal-kabul', 'Mal kabul', 'Depodan geleni stoğa al', 'Stok', '📦', '']
          ]
            .map(
              ([href, b, a, etiket, ikon, sinif], i) => `<a class="gst-islem gst-gir ${sinif}" style="--i:${8 + i}" href="${href}">
              <div><b>${b}</b><small>${a}</small><span class="gst-etiket">${etiket}</span></div><span class="gst-islem-ikon" aria-hidden="true">${ikon}</span></a>`
            )
            .join('')}
        </div>
      </section>

      <aside class="gst-yan gst-cam gst-gir" style="--i:3">
        <div class="gst-profil">
          <span class="gst-avatar">${esc(basHarf(CURRENT_USER.ad_soyad))}</span>
          <div><b>${esc(CURRENT_USER.ad_soyad)}</b><small>${esc(ROL[CURRENT_USER.rol] || CURRENT_USER.rol)}</small></div>
        </div>
        <div class="gst-mini-istatistik">
          <div><b data-sayi="${bugun.adet}">0</b><small>Bugün satış</small></div>
          <div><b>${hedefOran == null ? '—' : `<span data-sayi="${Math.round(hedefOran * 100)}" data-bicim="yuzde">%0</span>`}</b><small>Hedef</small></div>
          <div><b data-sayi="${calisan}">0</b><small>Ekipte</small></div>
        </div>
        <div class="gst-takvim-kutu">
          <div class="gst-takvim-ust"><b id="gst-ay-ad"></b>
            <span><button type="button" id="gst-ay-geri" aria-label="Önceki ay">‹</button><button type="button" id="gst-ay-ileri" aria-label="Sonraki ay">›</button></span>
          </div>
          <div id="gst-takvim"></div>
          <div class="gst-lejant"><span><i class="bugun"></i>Bugün</span><span><i class="nobet"></i>Nöbet</span></div>
        </div>
        <div class="gst-bolum-baslik"><h3>Yapılacaklar</h3><a href="#gorevler">tümü</a></div>
        <ul class="gst-gorevler">
          ${
            gorevler.length
              ? gorevler
                  .slice(0, 4)
                  .map(
                    (gv) => `<li><span class="gst-gorev-ikon ${gv.oncelik}" aria-hidden="true">${gv.oncelik === 'yuksek' ? '!' : '✓'}</span>
                    <div><small>${gv.oncelik === 'yuksek' ? 'Yüksek öncelik' : gv.oncelik === 'dusuk' ? 'Düşük öncelik' : 'Görev'}</small><b>${esc(gv.baslik)}</b>${gv.aciklama ? `<span>${esc(gv.aciklama)}</span>` : ''}</div></li>`
                  )
                  .join('')
              : '<li class="gst-bos">Bekleyen görev yok 🎉</li>'
          }
        </ul>
      </aside>
    </div>`;

    // Satis takibi grafigi: 14 gun / 12 ay
    const kutu = container.querySelector('#gst-grafik');
    const seriGun = g.map((d) => {
      const t = new Date(d.gun + 'T00:00:00');
      return { deger: d.toplam, adet: d.adet, kisa: `${t.getDate()} ${AY_KISA[t.getMonth()]}`, uzun: t.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }) };
    });
    const seriAy = ozet.aylik.map((d) => {
      const [yy, mm] = d.ay.split('-').map(Number);
      return { deger: d.toplam, adet: d.adet, kisa: AY_KISA[mm - 1], uzun: `${AYLAR[mm - 1]} ${yy}` };
    });
    buyukGrafik(kutu, seriGun);
    container.querySelectorAll('.gst-secim button').forEach((b) =>
      b.addEventListener('click', () => {
        container.querySelectorAll('.gst-secim button').forEach((x) => {
          x.classList.toggle('aktif', x === b);
          x.setAttribute('aria-selected', String(x === b));
        });
        buyukGrafik(kutu, b.dataset.donem === 'ay' ? seriAy : seriGun);
      })
    );

    // Takvim
    const yan = container.querySelector('.gst-yan');
    let takvimAy = new Date();
    takvimAy = new Date(takvimAy.getFullYear(), takvimAy.getMonth(), 1);
    const takvimGuncelle = () => takvimCiz(yan, takvimAy.getFullYear(), takvimAy.getMonth());
    container.querySelector('#gst-ay-geri').addEventListener('click', () => {
      takvimAy = new Date(takvimAy.getFullYear(), takvimAy.getMonth() - 1, 1);
      takvimGuncelle();
    });
    container.querySelector('#gst-ay-ileri').addEventListener('click', () => {
      takvimAy = new Date(takvimAy.getFullYear(), takvimAy.getMonth() + 1, 1);
      takvimGuncelle();
    });
    takvimGuncelle();

    container.querySelector('#gst-ara').addEventListener('submit', (e) => {
      e.preventDefault();
      const deger = container.querySelector('#gst-ara-girdi').value.trim();
      try {
        sessionStorage.setItem('eczanem-arama-seed', deger);
      } catch (err) {}
      location.hash = '#ilaclar';
    });

    sayac(container);
  }

  window.EczamGosterge = { render };
})();
