// Ana sayfa (gosterge paneli): KPI kutulari, son satislar, kategori radari,
// 7 gunluk trend (bu hafta / gecen hafta), ekip ve aylik hedef kartlari.
const AnaSayfaView = (() => {
  const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const ODEME = { nakit: 'Nakit', kredi_karti: 'Kart', sgk: 'SGK', veresiye: 'Veresiye', karma: 'Karma' };

  function kisaTl(n) {
    if (n >= 1000) return '₺' + (n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'k';
    return '₺' + Math.round(n).toLocaleString('tr-TR');
  }

  function basHarfler(ad) {
    return String(ad || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toLocaleUpperCase('tr-TR'))
      .join('');
  }

  // Ayni isim her zaman ayni tonu alsin (renk siraya degil kisiye bagli)
  const AVATAR_TONLARI = ['#c6ef4e', '#f4d35e', '#f7a8b8', '#b8a9f2', '#9ad8e0', '#f5b971'];
  function avatarTonu(ad) {
    let h = 0;
    for (const c of String(ad)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return AVATAR_TONLARI[h % AVATAR_TONLARI.length];
  }

  function degisim(bugun, dun) {
    if (!dun) return bugun ? '<span class="kpi-fark">dün satış yok</span>' : '<span class="kpi-fark">henüz satış yok</span>';
    const yuzde = Math.round(((bugun - dun) / dun) * 1000) / 10;
    const yon = yuzde >= 0 ? 'yukari' : 'asagi';
    return `<span class="kpi-fark ${yon}">${Ikon.svg(yon)} %${Math.abs(yuzde).toLocaleString('tr-TR')} <small>düne göre</small></span>`;
  }

  // Monoton kubik egri: veri noktalari arasinda tasma (sifirin altina inme) yapmaz
  function egriYolu(noktalar) {
    const n = noktalar.length;
    if (n < 2) return '';
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = noktalar[i + 1][0] - noktalar[i][0];
      m[i] = (noktalar[i + 1][1] - noktalar[i][1]) / dx[i];
    }
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${noktalar[0][0].toFixed(1)},${noktalar[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = noktalar[i], [x1, y1] = noktalar[i + 1], h = dx[i] / 3;
      d += ` C${(x0 + h).toFixed(1)},${(y0 + t[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - t[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
  }

  function guzelUst(maks) {
    if (maks <= 0) return 100;
    const us = Math.pow(10, Math.floor(Math.log10(maks)));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * us >= maks) return k * us;
    return 10 * us;
  }

  // Trend grafiginin geometrisi: cizim ve hover ayni olcegi kullanir
  const T = { G: 640, Y: 270, sol: 50, sag: 16, ust: 40, alt: 32 };
  function trendOlcek(gunluk) {
    const { G, Y, sol, sag, ust, alt } = T;
    const ust_deger = guzelUst(Math.max(...gunluk.map((g) => g.toplam)));
    return {
      ust_deger,
      x: (i) => sol + (i * (G - sol - sag)) / 6,
      y: (v) => ust + (1 - v / ust_deger) * (Y - ust - alt)
    };
  }

  function trendGrafigi(gunluk) {
    const buHafta = gunluk.slice(7);
    const gecenHafta = gunluk.slice(0, 7);
    const { G, Y, sol, sag, ust, alt } = T;
    const { ust_deger, x, y } = trendOlcek(gunluk);
    const p1 = buHafta.map((g, i) => [x(i), y(g.toplam)]);
    const p2 = gecenHafta.map((g, i) => [x(i), y(g.toplam)]);
    const yol1 = egriYolu(p1), yol2 = egriYolu(p2);
    const alan = `${yol1} L${x(6)},${y(0)} L${x(0)},${y(0)} Z`;

    const izgara = [0, 0.25, 0.5, 0.75, 1]
      .map((k) => {
        const v = ust_deger * k;
        return `<line x1="${sol}" x2="${G - sag}" y1="${y(v)}" y2="${y(v)}" class="izgara"/>
          <text x="${sol - 8}" y="${y(v) + 4}" class="eksen-yazi" text-anchor="end">${kisaTl(v)}</text>`;
      })
      .join('');
    const xEtiket = buHafta
      .map((g, i) => {
        const d = new Date(g.gun + 'T12:00:00');
        return `<text x="${x(i)}" y="${Y - 8}" class="eksen-yazi" text-anchor="middle">${GUN_KISA[d.getDay()]} ${d.getDate()}</text>`;
      })
      .join('');

    // Secici dogrudan etiket: yalnizca bu haftanin en yuksek gunu
    let enIyi = 0;
    buHafta.forEach((g, i) => { if (g.toplam > buHafta[enIyi].toplam) enIyi = i; });
    const etiket = buHafta[enIyi].toplam > 0
      ? (() => {
          const ex = x(enIyi), ey = y(buHafta[enIyi].toplam), metin = UI.tl(buHafta[enIyi].toplam);
          const w = metin.length * 7.4 + 22;
          const lx = Math.min(Math.max(ex - w / 2, sol), G - sag - w);
          return `<g class="tepe-etiket"><rect x="${lx}" y="${ey - 36}" width="${w}" height="24" rx="12"/>
            <text x="${lx + w / 2}" y="${ey - 20}" text-anchor="middle">${metin}</text></g>
            <circle cx="${ex}" cy="${ey}" r="5.5" class="tepe-nokta"/>`;
        })()
      : '';

    const hedefler = buHafta
      .map((g, i) => `<rect class="hover-hedef" data-i="${i}" x="${x(i) - (G - sol - sag) / 12}" y="${ust - 10}" width="${(G - sol - sag) / 6}" height="${Y - ust - alt + 10}"/>`)
      .join('');

    return `
      <div class="grafik-kutu" data-grafik="trend">
        <svg viewBox="0 0 ${G} ${Y}" class="grafik-svg" role="img" aria-label="Son 7 günün satışı ile önceki 7 günün karşılaştırması">
          <defs><linearGradient id="trend-dolgu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--lime)" stop-opacity="0.55"/><stop offset="1" stop-color="var(--lime)" stop-opacity="0.04"/>
          </linearGradient></defs>
          ${izgara}${xEtiket}
          <path d="${alan}" fill="url(#trend-dolgu)"/>
          <path d="${yol2}" class="seri seri-2"/>
          <path d="${yol1}" class="seri seri-1"/>
          <line class="artikil" x1="0" x2="0" y1="${ust - 6}" y2="${Y - alt}" hidden/>
          <circle class="hover-nokta seri-1-nokta" r="5" hidden/><circle class="hover-nokta seri-2-nokta" r="5" hidden/>
          ${etiket}${hedefler}
        </svg>
        <div class="grafik-ipucu" hidden></div>
      </div>`;
  }

  function trendEtkilesimi(kok, gunluk) {
    const kutu = kok.querySelector('[data-grafik="trend"]');
    if (!kutu) return;
    const svg = kutu.querySelector('svg');
    const ipucu = kutu.querySelector('.grafik-ipucu');
    const artikil = svg.querySelector('.artikil');
    const n1 = svg.querySelector('.seri-1-nokta'), n2 = svg.querySelector('.seri-2-nokta');
    const { G } = T;
    const { x, y } = trendOlcek(gunluk);
    const gizle = () => { ipucu.hidden = true; artikil.setAttribute('hidden', ''); n1.setAttribute('hidden', ''); n2.setAttribute('hidden', ''); };
    svg.querySelectorAll('.hover-hedef').forEach((h) => {
      h.addEventListener('mouseenter', () => {
        const i = Number(h.dataset.i);
        const a = gunluk[7 + i], b = gunluk[i];
        artikil.setAttribute('x1', x(i)); artikil.setAttribute('x2', x(i)); artikil.removeAttribute('hidden');
        n1.setAttribute('cx', x(i)); n1.setAttribute('cy', y(a.toplam)); n1.removeAttribute('hidden');
        n2.setAttribute('cx', x(i)); n2.setAttribute('cy', y(b.toplam)); n2.removeAttribute('hidden');
        const d = new Date(a.gun + 'T12:00:00');
        ipucu.innerHTML = `<b>${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}</b>
          <div><i class="lejant-cizgi seri-1"></i>Bu hafta <span>${UI.tl(a.toplam)} · ${a.adet} satış</span></div>
          <div><i class="lejant-cizgi seri-2"></i>Geçen hafta <span>${UI.tl(b.toplam)} · ${b.adet} satış</span></div>`;
        ipucu.hidden = false;
        const oran = svg.getBoundingClientRect().width / G;
        const px = x(i) * oran;
        ipucu.style.left = Math.min(Math.max(px - 130, 0), kutu.clientWidth - 260) + 'px';
      });
    });
    svg.addEventListener('mouseleave', gizle);
  }

  function radarGrafigi(kategoriler) {
    if (kategoriler.length < 3) {
      return `<div class="empty-state">Radar için en az 3 kategoride satış gerekiyor.</div>`;
    }
    const B = 300, mx = B / 2, my = B / 2 + 4, r = 98;
    const n = kategoriler.length;
    const maks = Math.max(1, ...kategoriler.flatMap((k) => [k.son_30, k.onceki_30]));
    const aci = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const nokta = (i, oran) => [mx + Math.cos(aci(i)) * r * oran, my + Math.sin(aci(i)) * r * oran];
    const cokgen = (oranlar) => oranlar.map((o, i) => nokta(i, o).map((v) => v.toFixed(1)).join(',')).join(' ');

    const halkalar = [0.25, 0.5, 0.75, 1].map((o) => `<polygon points="${cokgen(Array(n).fill(o))}" class="izgara"/>`).join('');
    const eksenler = kategoriler
      .map((k, i) => {
        const [ex, ey] = nokta(i, 1);
        const [lx, ly] = nokta(i, 1.2);
        const hiza = Math.abs(lx - mx) < 8 ? 'middle' : lx > mx ? 'start' : 'end';
        return `<line x1="${mx}" y1="${my}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" class="izgara"/>
          <text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${hiza}" class="eksen-yazi koyu">${UI.esc(k.kategori)}</text>`;
      })
      .join('');
    const hedefler = kategoriler
      .map((k, i) => {
        const [hx, hy] = nokta(i, 0.62);
        return `<circle class="hover-hedef" data-i="${i}" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="34"/>`;
      })
      .join('');
    return `
      <div class="grafik-kutu" data-grafik="radar">
        <svg viewBox="-40 0 ${B + 80} ${B + 8}" class="grafik-svg radar" role="img" aria-label="Kategorilere göre son 30 gün ve önceki 30 gün ciro">
          ${halkalar}${eksenler}
          <polygon points="${cokgen(kategoriler.map((k) => k.son_30 / maks))}" class="radar-alan seri-1"/>
          <polygon points="${cokgen(kategoriler.map((k) => k.onceki_30 / maks))}" class="radar-cizgi seri-2"/>
          ${hedefler}
        </svg>
        <div class="grafik-ipucu" hidden></div>
      </div>`;
  }

  function radarEtkilesimi(kok, kategoriler) {
    const kutu = kok.querySelector('[data-grafik="radar"]');
    if (!kutu) return;
    const ipucu = kutu.querySelector('.grafik-ipucu');
    kutu.querySelectorAll('.hover-hedef').forEach((h) => {
      h.addEventListener('mouseenter', () => {
        const k = kategoriler[Number(h.dataset.i)];
        ipucu.innerHTML = `<b>${UI.esc(k.kategori)}</b>
          <div><i class="lejant-cizgi seri-1"></i>Son 30 gün <span>${UI.tl(k.son_30)}</span></div>
          <div><i class="lejant-cizgi seri-2"></i>Önceki 30 gün <span>${UI.tl(k.onceki_30)}</span></div>`;
        ipucu.hidden = false;
        ipucu.style.left = '50%';
        ipucu.style.transform = 'translateX(-50%)';
      });
      h.addEventListener('mouseleave', () => { ipucu.hidden = true; });
    });
  }

  function veriTablosu(baslik, sutunlar, satirlar) {
    return `<details class="veri-tablo"><summary>${baslik}</summary><table>
      <thead><tr>${sutunlar.map((s, i) => `<th class="${i ? 'num' : ''}">${s}</th>`).join('')}</tr></thead>
      <tbody>${satirlar.map((r) => `<tr>${r.map((h, i) => `<td class="${i ? 'num' : ''}">${h}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></details>`;
  }

  // Hap (kapsul) maskot: referans tasarimdaki karakterin eczane karsiligi
  const MASKOT = `<svg class="maskot" viewBox="0 0 140 120" aria-hidden="true">
    <g transform="rotate(-28 70 70)">
      <rect x="18" y="42" width="112" height="52" rx="26" fill="#fff" stroke="#10110e" stroke-width="4"/>
      <path d="M74 42h30a26 26 0 0 1 0 52H74Z" fill="#10110e"/>
      <circle cx="44" cy="62" r="5" fill="#10110e"/><circle cx="60" cy="62" r="5" fill="#10110e"/>
      <circle cx="46" cy="60.5" r="1.6" fill="#fff"/><circle cx="62" cy="60.5" r="1.6" fill="#fff"/>
      <path d="M45 74q7 6 14 0" fill="none" stroke="#10110e" stroke-width="3.5" stroke-linecap="round"/>
    </g></svg>`;


  // Akilli oneriler: stok bitis tahmini, SKT indirim onerisi ve gun sonu ozeti
  function oneriKarti(o, yoneticiMi) {
    if (!o) return '';
    const bos = (m) => `<li class="oneri-bos">${m}</li>`;
    const durumEtiket = { bitti: ['Bitti', 'tehlike'], yarin_biter: ['Yarın biter', 'tehlike'], yakinda: ['Yakında', 'uyari'] };
    const bitiyor = o.bitmek_uzere.length
      ? o.bitmek_uzere
          .slice(0, 5)
          .map((b) => {
            const [et, ton] = durumEtiket[b.durum];
            return `<li><span class="islem-metin"><b>${UI.esc(b.ad)}</b><small>Stok ${b.stok} · günde ~${b.gunluk_ortalama} adet · önerilen sipariş ${b.onerilen_adet}</small></span><span class="oneri-etiket ${ton}">${et}${b.durum === 'yakinda' ? ` · ${b.yetecek_gun} gün` : ''}</span></li>`;
          })
          .join('')
      : bos('Stoklar rahat görünüyor 👍');
    const skt = o.skt_indirim.length
      ? o.skt_indirim
          .slice(0, 5)
          .map((x) =>
            x.tur === 'dolmus'
              ? `<li><span class="islem-metin"><b>${UI.esc(x.ad)}</b><small>${x.parti_no ? 'Parti ' + UI.esc(x.parti_no) : 'Partisiz'} · ${x.miktar} adet · SKT ${UI.esc(x.skt)}</small></span><span class="oneri-etiket tehlike">Süresi geçti</span></li>`
              : `<li><span class="islem-metin"><b>${UI.esc(x.ad)}</b><small>${x.fazla} adet SKT'ye (${x.kalan_gun} gün) kadar satılamayabilir · olası zarar ${UI.tl(x.tahmini_zarar)}</small></span>${
                  x.kampanya_var
                    ? '<span class="oneri-etiket iyi">Kampanya aktif</span>'
                    : yoneticiMi && !x.receteli
                      ? `<a class="oneri-etiket uyari oneri-link" href="#kampanyalar" title="Kampanyalar sayfasında önerilen indirimle başlatın">%${x.onerilen_indirim} indirim · Kampanya aç</a>`
                      : `<span class="oneri-etiket uyari">%${x.onerilen_indirim} indirim</span>`
                }</li>`
          )
          .join('')
      : bos('Yaklaşan riskli parti yok');
    const gs = o.gun_sonu;
    const fark = gs.dun_ciro > 0 ? Math.round(((gs.ciro - gs.dun_ciro) / gs.dun_ciro) * 100) : null;
    const farkHtml = fark === null ? '' : `<small class="${fark >= 0 ? 'artis' : 'dusus'}">${fark >= 0 ? '▲' : '▼'} %${Math.abs(fark)} dünden</small>`;
    return `<section class="card p-oneri">
      <div class="kart-bas"><h3>Akıllı Öneriler</h3>
        ${o.mesajlar.length ? `<span class="oneri-ozet">${o.mesajlar.length} uyarı</span>` : '<span class="oneri-ozet iyi">Her şey yolunda</span>'}</div>
      <div class="oneri-sutunlar">
        <div><h4>Stoğu bitiyor${o.bitmek_uzere_toplam > 5 ? ` <small>(${o.bitmek_uzere_toplam})</small>` : ''}</h4><ul class="oneri-liste">${bitiyor}</ul>
          ${yoneticiMi && o.bitmek_uzere.length ? '<a class="hap-link" href="#siparisler">Akıllı sipariş oluştur ' + Ikon.svg('ok') + '</a>' : ''}</div>
        <div><h4>SKT için öneri${o.skt_indirim_toplam > 5 ? ` <small>(${o.skt_indirim_toplam})</small>` : ''}</h4><ul class="oneri-liste">${skt}</ul></div>
        <div><h4>Bugünün özeti</h4>
          <div class="gun-sonu"><div><span>Ciro</span><b>${UI.tl(gs.ciro)}</b>${farkHtml}</div>
            <div><span>Tahmini kâr</span><b>${UI.tl(gs.kar)}</b></div>
            <div><span>Satış</span><b>${gs.satis_adedi}</b></div></div>
          ${gs.en_cok_satan ? `<p class="oneri-not">En çok satan: <b>${UI.esc(gs.en_cok_satan.ad)}</b> (${gs.en_cok_satan.adet} adet)</p>` : ''}
          ${o.olu_stok.adet ? `<p class="oneri-not">💤 ${o.olu_stok.adet} ürün ${o.olu_stok.gun} gündür satılmadı · bağlı sermaye <b>${UI.tl(o.olu_stok.bagli_sermaye)}</b></p>` : ''}</div>
      </div>
    </section>`;
  }

  async function render(container) {
    container.innerHTML = '<div class="empty-state">Yükleniyor...</div>';
    const buAy = new Date().toISOString().slice(0, 7);
    const yoneticiMi = CURRENT_USER.rol === 'admin' || CURRENT_USER.rol === 'eczaci';

    const [ozet, uyarilar, gorevler, nobetler, siparisler, hedef, ekip, duyurular, oneri] = await Promise.all([
      Api.get('/api/satislar/panel-ozet'),
      Api.get('/api/ilaclar/uyarilar'),
      Api.get('/api/gorevler?durum=bekliyor'),
      Api.get('/api/nobetler?ay=' + buAy),
      yoneticiMi ? Api.get('/api/siparisler?durum=beklemede') : Promise.resolve([]),
      Api.get('/api/hedefler/aktif').catch(() => null),
      Api.get('/api/vardiyalar/bugun').catch(() => []),
      Api.get('/api/sistem/duyurular').catch(() => []),
      Api.get('/api/oneriler').catch(() => null)
    ]);

    const g = ozet.gunluk;
    const bugun = g[g.length - 1], dun = g[g.length - 2];
    const haftaToplam = g.slice(7).reduce((t, x) => t + x.toplam, 0);
    const gecenHaftaToplam = g.slice(0, 7).reduce((t, x) => t + x.toplam, 0);
    const calisanlar = ekip.filter((v) => v.tip === 'calisma');

    const sonSatislar = ozet.son_satislar.length
      ? ozet.son_satislar
          .map((s) => {
            const ad = s.musteri_adi || 'Perakende';
            const urun = s.ilk_urun ? s.ilk_urun + (s.kalem_sayisi > 1 ? ` +${s.kalem_sayisi - 1}` : '') : '-';
            const d = new Date(s.tarih.replace(' ', 'T') + 'Z');
            return `<li class="islem">
              <span class="islem-ikon" style="background:${avatarTonu(ad)}">${UI.esc(basHarfler(ad))}</span>
              <span class="islem-metin"><b>${UI.esc(ad)}</b><small>${UI.esc(urun)} · ${d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span>
              <span class="islem-tutar">${UI.tl(s.toplam_tutar)}<small>${ODEME[s.odeme_tipi] || s.odeme_tipi}</small></span>
            </li>`;
          })
          .join('')
      : '<li class="empty-state">Henüz satış yok</li>';

    const ekipHtml = calisanlar.length
      ? calisanlar
          .map((v) => `<span class="avatar buyuk" style="background:${avatarTonu(v.ad_soyad)}" title="${UI.esc(v.ad_soyad)} · ${v.baslangic}–${v.bitis}">${UI.esc(basHarfler(v.ad_soyad))}</span>`)
          .join('')
      : '<span class="ekip-bos">Bugün için vardiya girilmemiş</span>';

    const hedefVar = hedef && hedef.hedef;
    const promo = hedefVar
      ? `<p class="promo-baslik">${hedef.yuzde >= 100 ? `Aylık hedef <span class="promo-halka">%${Math.round(hedef.yuzde)}</span> ile aşıldı` : `Aylık hedefte <span class="promo-halka">%${Math.round(hedef.yuzde)}</span> tamam`}</p>
         <p class="promo-alt">${UI.tl(hedef.gerceklesen)} / ${UI.tl(hedef.hedef)}</p>
         <div class="promo-cubuk"><div style="width:${Math.min(100, hedef.yuzde)}%"></div></div>`
      : `<p class="promo-baslik">Bu hafta <span class="promo-halka">${g.slice(7).reduce((t, x) => t + x.adet, 0)}</span> satış</p>
         <p class="promo-alt">Aylık hedef koyup ilerlemeyi buradan izleyebilirsiniz.</p>`;

    const bekleyen = [
      { ikon: 'gorevler', ad: 'Bekleyen görev', sayi: gorevler.length, link: '#gorevler', alt: gorevler[0] ? gorevler[0].baslik : 'Hepsi tamam' },
      { ikon: 'nobetler', ad: 'Bu ayki nöbet', sayi: nobetler.length, link: '#nobetler', alt: nobetler[0] ? 'İlki: ' + nobetler[0].tarih : 'Kayıt yok' },
      ...(yoneticiMi
        ? [{ ikon: 'siparisler', ad: 'Bekleyen sipariş', sayi: siparisler.length, link: '#siparisler', alt: siparisler[0] ? '#' + siparisler[0].id + ' ' + (siparisler[0].tedarikci_adi || '') : 'Sipariş yok' }]
        : [])
    ];

    const duyuruHtml =
      duyurular.length || yoneticiMi
        ? `<section class="duyuru-pano" aria-label="Duyurular">
            <div class="duyuru-bas">${Ikon.svg('duyuru')}<b>Duyurular</b>${yoneticiMi ? '<button type="button" class="secondary" id="duyuru-ekle">+ Duyuru</button>' : ''}</div>
            ${
              duyurular.length
                ? `<ul>${duyurular
                    .map(
                      (d) => `<li class="${d.onemli ? 'onemli' : ''}"><div><b>${UI.esc(d.baslik)}</b>${d.metin ? `<span>${UI.esc(d.metin)}</span>` : ''}
                        <small>${UI.esc(d.yazan || '')} · ${UI.tarih(d.tarih).slice(0, 10)}${d.sube_id === null ? ' · tüm şubeler' : ''}${d.bitis ? ` · ${d.bitis} tarihine kadar` : ''}</small></div>
                        ${yoneticiMi ? `<button type="button" class="secondary" data-duyuru-sil="${d.id}" aria-label="Duyuruyu sil">Sil</button>` : ''}</li>`
                    )
                    .join('')}</ul>`
                : '<p class="form-ipucu" style="margin:0">Ekibe duyuru yok. "+ Duyuru" ile ekleyebilirsiniz.</p>'
            }
          </section>`
        : '';

    container.innerHTML = `
      ${duyuruHtml}
      <div class="panel-grid">
        <div class="kpi kpi-vurgu">
          <span class="kpi-etiket">Bugünkü Ciro</span>
          <span class="kpi-deger">${UI.tl(bugun.toplam)}</span>
          ${degisim(bugun.toplam, dun.toplam)}
        </div>
        <div class="kpi">
          <span class="kpi-etiket">Bugünkü Satış</span>
          <span class="kpi-deger">${bugun.adet}</span>
          ${degisim(bugun.adet, dun.adet)}
        </div>
        <a class="kpi kpi-link" href="#ilaclar">
          <span class="kpi-etiket">Kritik Stok</span>
          <span class="kpi-deger ${uyarilar.kritik_stok.length ? 'tehlike' : ''}">${uyarilar.kritik_stok.length}</span>
          <span class="kpi-fark">ürün kritik seviyede ${Ikon.svg('ok')}</span>
        </a>
        <a class="kpi kpi-link" href="#ilaclar">
          <span class="kpi-etiket">SKT Uyarısı</span>
          <span class="kpi-deger ${uyarilar.skt_yaklasan.length ? 'uyari' : ''}">${uyarilar.skt_yaklasan.length}</span>
          <span class="kpi-fark">miadı yaklaşan ürün ${Ikon.svg('ok')}</span>
        </a>

        <section class="card p-islem">
          <div class="kart-bas"><h3>Son Satışlar</h3><a class="hap-link" href="#satis">Yeni satış ${Ikon.svg('ok')}</a></div>
          <ul class="islem-liste">${sonSatislar}</ul>
        </section>

        <section class="card p-radar">
          <div class="kart-bas"><h3>Kategori Dağılımı</h3>
            <span class="lejant"><span><i class="lejant-alan"></i>Son 30 gün</span><span><i class="lejant-cizgi seri-2"></i>Önceki 30 gün</span></span></div>
          ${radarGrafigi(ozet.kategoriler)}
          ${ozet.kategoriler.length ? veriTablosu('Tablo olarak gör', ['Kategori', 'Son 30 gün', 'Önceki 30 gün'], ozet.kategoriler.map((k) => [UI.esc(k.kategori), UI.tl(k.son_30), UI.tl(k.onceki_30)])) : ''}
        </section>

        <section class="card p-hizli">
          <h3>Hızlı İşlem</h3>
          <form class="hizli-ara" id="hizli-ara">
            ${Ikon.svg('ara')}<input id="hizli-ara-input" placeholder="Barkod okutun veya ilaç arayın" autocomplete="off" />
          </form>
          <div class="ekip-satir"><span class="mini-baslik">Bugün ekipte</span>
            <div class="ekip">${ekipHtml}<a class="avatar buyuk ekle" href="#vardiya" title="Vardiya çizelgesi">${Ikon.svg('arti')}</a></div>
          </div>
          <div class="kisayollar">
            ${[['iadeler', 'İade', yoneticiMi], ['kasa-kapanisi', 'Kasa', true], ['hatirlatmalar', 'Hatırlatma', true], ['istekler', 'İstek', true]]
              .filter((k) => k[2])
              .map((k) => `<a href="#${k[0]}">${Ikon.svg(k[0])}<span>${k[1]}</span></a>`)
              .join('')}
          </div>
          <a class="buton-link" href="#satis">${Ikon.svg('satis')} Satış Başlat</a>
          ${yoneticiMi ? `<a class="buton-link ikincil" href="#mal-kabul">${Ikon.svg('mal-kabul')} Mal Kabul</a>` : ''}
        </section>

        <section class="card p-bekleyen">
          <div class="kart-bas"><h3>Yapılacaklar</h3></div>
          <ul class="bekleyen-liste">
            ${bekleyen
              .map((b) => `<li><a href="${b.link}">
                <span class="bekleyen-ikon">${Ikon.svg(b.ikon)}</span>
                <span class="islem-metin"><b>${b.ad}</b><small>${UI.esc(b.alt)}</small></span>
                <span class="bekleyen-sayi ${b.sayi ? 'dolu' : ''}">${b.sayi}</span></a></li>`)
              .join('')}
          </ul>
        </section>

        <section class="card p-trend">
          <div class="kart-bas"><h3>Son 7 Gün Satış Trendi</h3>
            <span class="lejant"><span><i class="lejant-cizgi seri-1"></i>Bu hafta ${kisaTl(haftaToplam)}</span><span><i class="lejant-cizgi seri-2"></i>Geçen hafta ${kisaTl(gecenHaftaToplam)}</span></span></div>
          ${trendGrafigi(g)}
          ${veriTablosu('Tablo olarak gör', ['Gün', 'Bu hafta', 'Geçen hafta'], g.slice(7).map((x, i) => [x.gun, UI.tl(x.toplam), UI.tl(g[i].toplam)]))}
        </section>

        <section class="p-promo">
          ${promo}
          <a class="promo-link" href="#analiz">Satış analizine git ${Ikon.svg('ok')}</a>
          ${MASKOT}
        </section>

        ${oneriKarti(oneri, yoneticiMi)}
      </div>
    `;

    const duyuruEkle = container.querySelector('#duyuru-ekle');
    if (duyuruEkle) {
      duyuruEkle.addEventListener('click', () => {
        const modal = UI.openModal(`
          <h3>Yeni Duyuru</h3>
          <form id="duyuru-form">
            <div><label>Başlık</label><input name="baslik" required maxlength="120" /></div>
            <div style="margin-top:10px"><label>Açıklama</label><textarea name="metin" rows="3" maxlength="1000"></textarea></div>
            <div class="form-grid" style="margin-top:10px">
              <div><label>Bitiş tarihi (opsiyonel)</label><input name="bitis" type="date" /></div>
            </div>
            <div><label><input type="checkbox" name="onemli" style="width:auto" /> Önemli (üstte ve vurgulu)</label></div>
            ${CURRENT_USER.rol === 'admin' ? '<div><label><input type="checkbox" name="tum_subeler" style="width:auto" /> Tüm şubelere</label></div>' : ''}
            <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Vazgeç</button><button type="submit">Yayınla</button></div>
          </form>`);
        modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
        modal.querySelector('#duyuru-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target;
          try {
            await Api.post('/api/sistem/duyurular', {
              baslik: f.baslik.value,
              metin: f.metin.value,
              bitis: f.bitis.value || null,
              onemli: f.onemli.checked,
              tum_subeler: f.tum_subeler ? f.tum_subeler.checked : false
            });
            UI.closeModal(modal);
            UI.toast('Duyuru yayınlandı', 'success');
            render(container);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      });
    }
    container.querySelectorAll('[data-duyuru-sil]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!window.confirm('Duyuru silinsin mi?')) return;
        try {
          await Api.del('/api/sistem/duyurular/' + b.dataset.duyuruSil);
          render(container);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      })
    );

    trendEtkilesimi(container, g);
    radarEtkilesimi(container, ozet.kategoriler);
    container.querySelector('#hizli-ara').addEventListener('submit', (e) => {
      e.preventDefault();
      const deger = container.querySelector('#hizli-ara-input').value.trim();
      try { sessionStorage.setItem('eczanem-arama-seed', deger); } catch (err) {}
      location.hash = '#ilaclar';
    });
  }

  return { render, basHarfler };
})();
