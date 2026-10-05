(function () {
  const SEKMELER = [
    ['ozet', 'Özet'],
    ['aile', 'Ürün ailesi'],
    ['fiyat', 'Fiyat hareketleri'],
    ['etkin', 'Etkin madde / ATC'],
    ['esdeger', 'Eşdeğer'],
    ['sut', 'SUT / KÜB / KT'],
    ['maliyet', 'Hasta maliyeti'],
    ['tablet', 'Tablet bilgisi']
  ];
  const RECETE = { kirmizi: 'Kırmızı', yesil: 'Yeşil', mor: 'Mor', turuncu: 'Turuncu' };
  const HASTA = { aktif: 'Aktif çalışan / bakmakla yükümlü', emekli: 'Emekli', muaf: 'Katılım payından muaf' };
  const DURUM = { aktif: ['Aktif', 'ok'], pasif: ['Pasif', 'danger'], pasife_alinacak: ['Pasife alınacak', 'warn'] };

  const sayi = (v) => (v == null ? '-' : UI.tl(v));
  const satir = (a, d) => `<tr><td style="color:var(--text-muted);width:34%">${a}</td><td>${d}</td></tr>`;

  // PSF ve kamu fiyati serisi icin sade cizgi grafigi (disaridan kutuphane yok)
  function grafik(hareketler) {
    const noktalar = hareketler.filter((h) => h.psf != null || h.kf != null).slice().reverse();
    if (noktalar.length < 2) return '<p class="form-ipucu">Grafik için en az iki fiyat kaydı gerekir.</p>';
    const W = 560, H = 190, sol = 52, alt = 24, ust = 10;
    const degerler = noktalar.flatMap((h) => [h.psf, h.kf]).filter((v) => v != null);
    const en = Math.max(...degerler);
    const t = (i) => sol + (i * (W - sol - 10)) / (noktalar.length - 1);
    const y = (v) => ust + (1 - v / en) * (H - ust - alt);
    const cizgi = (alan, renk) => {
      const p = noktalar.map((h, i) => (h[alan] == null ? null : `${t(i).toFixed(1)},${y(h[alan]).toFixed(1)}`)).filter(Boolean);
      return p.length > 1 ? `<polyline fill="none" stroke="${renk}" stroke-width="2.2" points="${p.join(' ')}"/>` : '';
    };
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:640px" role="img" aria-label="Fiyat grafiği">
      ${[0, 0.5, 1].map((o) => `<line x1="${sol}" x2="${W - 10}" y1="${y(en * o)}" y2="${y(en * o)}" stroke="var(--border)" stroke-dasharray="3 4"/><text x="${sol - 6}" y="${y(en * o) + 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">${Math.round(en * o)}</text>`).join('')}
      ${cizgi('psf', 'var(--accent-rose-fg)')}${cizgi('kf', 'var(--seri-2)')}
      <text x="${sol}" y="${H - 6}" font-size="10" fill="var(--text-muted)">${UI.esc(noktalar[0].tarih)}</text>
      <text x="${W - 10}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--text-muted)">${UI.esc(noktalar[noktalar.length - 1].tarih)}</text>
    </svg>
    <div class="form-ipucu"><span style="color:var(--accent-rose-fg)">━</span> Perakende satış fiyatı (PSF) &nbsp; <span style="color:var(--seri-2)">━</span> Kamu fiyatı (KF)</div>`;
  }

  const sekmeHtml = {
    ozet(k) {
      const i = k.ilac;
      const t = k.titck;
      return `<table><tbody>
        ${satir('Barkod', UI.esc(i.barkod || '-'))}
        ${satir('Firma', UI.esc(i.uretici || (t && t.firma) || '-'))}
        ${satir('Kategori', UI.esc(i.kategori || '-'))}
        ${satir('Satış fiyatı', UI.tl(i.satis_fiyati))}
        ${satir('Stok (bu şube)', `<b>${i.stok}</b>`)}
        ${satir('Reçete', i.receteli ? 'Reçeteli' : 'Reçetesiz')}
        ${satir('TİTCK durumu', t ? `<span class="badge ${DURUM[t.durum][1]}">${DURUM[t.durum][0]}</span>${t.recete_turu ? ` · ${RECETE[t.recete_turu] || ''} reçete` : ''}${t.temel_ilac ? ' · Temel ilaç listesinde' : ''}` : '<span class="form-ipucu">TİTCK listesinde bulunamadı veya liste yüklenmemiş</span>')}
        ${satir('SGK kapsamı', k.bilgi.sgk_kapsaminda ? 'Kapsamda' : '-')}
      </tbody></table>
      ${t && t.durum !== 'aktif' ? '<div class="uyari-kutu" style="margin-top:12px;padding:10px 14px;border-radius:10px;background:var(--warning-soft);color:var(--warning)"><b>Dikkat:</b> Bu ürün TİTCK listesinde aktif görünmüyor. Satış ve reçete uygunluğunu kontrol edin.</div>' : ''}`;
    },
    fiyat(k) {
      const h = k.hareketler;
      return `${grafik(h)}
        <table style="margin-top:12px"><thead><tr><th>Tarih</th><th class="num">İSF</th><th class="num">DSF</th><th class="num">PSF</th><th class="num">KF</th><th class="num">KÖ</th><th class="num">FF</th><th class="num">Kİ</th><th>İşlem</th></tr></thead>
        <tbody>${
          h.length
            ? h
                .map(
                  (x) => `<tr><td>${UI.esc(x.tarih)}</td><td class="num">${sayi(x.isf)}</td><td class="num">${sayi(x.dsf)}</td>
                  <td class="num">${sayi(x.psf)} ${x.psf_yon === 'artis' ? '<span style="color:var(--danger)">▲</span>' : x.psf_yon === 'dusus' ? '<span style="color:var(--success)">▼</span>' : ''}</td>
                  <td class="num">${sayi(x.kf)}</td><td class="num">${sayi(x.ko)}</td><td class="num">${sayi(x.ff)}</td><td class="num">${x.ki == null ? '-' : '%' + x.ki}</td><td>${UI.esc(x.kaynak || '')}</td></tr>`
                )
                .join('')
            : '<tr><td colspan="9" class="empty-state">Fiyat kaydı yok. Bilgileri “Tablet bilgisi” sekmesinden girin veya CSV ile yükleyin.</td></tr>'
        }</tbody></table>
        <p class="form-ipucu">İSF: imalatçı, DSF: depocu, PSF: perakende satış, KF: kamu fiyatı, KÖ: kamu ödenecek, FF: fiyat farkı (PSF − KF), Kİ: kurum iskontosu.</p>`;
    },
    etkin(k) {
      const t = k.titck;
      return `<table><tbody>
        ${satir('ATC kodu', UI.esc(k.atc_kodu || '-'))}
        ${satir('ATC adı', UI.esc((t && t.atc_adi) || '-'))}
        ${satir('ATC ana grubu', UI.esc((t && t.atc_grubu) || '-'))}
        ${satir('Etken madde', k.etkin_maddeler.length ? k.etkin_maddeler.map((m) => `<span class="badge muted">${UI.esc(m)}</span>`).join(' ') : '-')}
        ${satir('Endikasyon', UI.esc(k.bilgi.endikasyon || '-'))}
      </tbody></table>
      <p class="form-ipucu">ATC kodu TİTCK listesi yüklendiğinde barkod eşleşmesiyle otomatik dolar. Etken madde, etkileşim ve alerji kontrollerinde kullanılır.</p>`;
    },
    esdeger(k) {
      const tb = k.esdegerler.length
        ? `<div class="toolbar" style="margin:6px 0"><button class="secondary" data-secili="karsilastir">Seçilenleri karşılaştır</button><button class="secondary" data-secili="sepet">Seçilenleri sepete ekle</button></div>
           <table><thead><tr><th></th><th>Ürün</th><th>Firma</th><th class="num">Stok</th><th class="num">Fiyat</th><th class="num">Fark</th><th></th></tr></thead><tbody>${k.esdegerler
            .map(
              (e) => `<tr><td><input type="checkbox" class="kart-sec" value="${e.id}" aria-label="Seç" /></td><td>${UI.esc(e.ad)}</td><td>${UI.esc(e.uretici || '-')}</td><td class="num">${e.stok}</td><td class="num">${UI.tl(e.satis_fiyati)}</td>
              <td class="num" style="color:${e.fiyat_farki < 0 ? 'var(--success)' : e.fiyat_farki > 0 ? 'var(--danger)' : 'inherit'}">${e.fiyat_farki > 0 ? '+' : ''}${UI.tl(e.fiyat_farki)}</td>
              <td><button class="secondary" data-kart="${e.id}">Kart</button></td></tr>`
            )
            .join('')}</tbody></table>`
        : '<p class="empty-state">Katalogda eşdeğer ürün yok.</p>';
      const tt = k.titck_esdegerler.length
        ? `<h4 style="margin:18px 0 6px">TİTCK listesinde, katalogda olmayan eşdeğerler (${k.titck_esdegerler.length})</h4>
           <table><thead><tr><th>Ürün</th><th>Firma</th><th></th></tr></thead><tbody>${k.titck_esdegerler
             .map((e) => `<tr><td>${UI.esc(e.ad)}</td><td>${UI.esc(e.firma || '-')}</td><td><button class="secondary" data-ekle="${UI.esc(e.barkod)}">Kataloğa ekle</button></td></tr>`)
             .join('')}</tbody></table>`
        : '';
      return `<p class="form-ipucu">Eşleşme ölçütü: <b>${UI.esc(k.esdeger_kaynagi || 'yok')}</b>. Muadil değişimi reçete ve hekim kuralına uygun olmalıdır.</p>${tb}${tt}`;
    },
    aile() {
      return '<div id="kart-aile"><span class="form-ipucu">Yükleniyor…</span></div>';
    },
    sut(k) {
      const b = k.bilgi;
      const baglanti = (u, ad) => (u ? `<a href="${UI.esc(u)}" target="_blank" rel="noopener noreferrer"><button type="button" class="secondary">${ad}</button></a>` : `<span class="form-ipucu">${ad}: bağlantı girilmemiş</span>`);
      return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${baglanti(b.kub_url, 'KÜB aç')} ${baglanti(b.kt_url, 'KT aç')}</div>
        <h4 style="margin:0 0 6px">SUT / ödeme notu</h4>
        <div class="card" style="white-space:pre-wrap">${b.sut_notu ? UI.esc(b.sut_notu) : '<span class="form-ipucu">Not girilmemiş. “Tablet bilgisi” sekmesinden ekleyebilirsiniz.</span>'}</div>
        <p class="form-ipucu">SUT maddeleri ve KÜB/KT belgeleri resmî kaynaklardan (SGK, TİTCK) alınmalıdır; burada eczanenizin notları ve bağlantıları tutulur.</p>`;
    },
    maliyet(k) {
      return `<div class="form-grid" style="max-width:640px">
          <div><label>Hasta türü</label><select id="hm-hasta">${Object.entries(HASTA).map(([v, a]) => `<option value="${v}">${a}</option>`).join('')}</select></div>
          <div><label>Kutu adedi</label><input id="hm-adet" type="number" min="1" max="99" value="1" /></div>
        </div>
        <div id="hm-sonuc" style="margin-top:14px"></div>`;
    },
    tablet(k, yazma) {
      const b = k.bilgi;
      const s = k.secenekler;
      const sec = (liste, secili) => `<option value=""></option>${liste.map((v) => `<option value="${v}" ${secili === v ? 'selected' : ''}>${v}</option>`).join('')}`;
      const renkler = (b.tablet_renk || '').split(',');
      const d = yazma ? '' : 'disabled';
      return `<form id="kart-form">
        <div class="form-grid">
          <div><label>ATC kodu</label><input name="atc_kodu" value="${UI.esc(b.atc_kodu || k.atc_kodu || '')}" placeholder="N02BE01" ${d}/></div>
          <div><label>Endikasyon</label><input name="endikasyon" value="${UI.esc(b.endikasyon || '')}" ${d}/></div>
          <div><label>Tablet rengi 1</label><select name="renk1" ${d}>${sec(s.renkler, renkler[0])}</select></div>
          <div><label>Tablet rengi 2</label><select name="renk2" ${d}>${sec(s.renkler, renkler[1])}</select></div>
          <div><label>Şekil</label><select name="tablet_sekil" ${d}>${sec(s.sekiller, b.tablet_sekil)}</select></div>
          <div><label>Üzerindeki yazı / logo</label><input name="tablet_yazi" value="${UI.esc(b.tablet_yazi || '')}" ${d}/></div>
          <div><label>Çentik</label><select name="tablet_centik" ${d}>${sec(s.centikler, b.tablet_centik)}</select></div>
          <div><label><input type="checkbox" name="tablet_seffaf" ${b.tablet_seffaf ? 'checked' : ''} ${d}/> Şeffaf / yarı şeffaf kapsül</label></div>
          <div><label>İmalatçı fiyatı (İSF)</label><input name="imalatci_fiyati" value="${b.imalatci_fiyati ?? ''}" ${d}/></div>
          <div><label>Depocu fiyatı (DSF)</label><input name="depocu_fiyati" value="${b.depocu_fiyati ?? ''}" ${d}/></div>
          <div><label>Kamu fiyatı (KF)</label><input name="kamu_fiyati" value="${b.kamu_fiyati ?? ''}" ${d}/></div>
          <div><label>Kamu ödenecek (KÖ)</label><input name="kamu_odenecek" value="${b.kamu_odenecek ?? ''}" ${d}/></div>
          <div><label>KÜB bağlantısı</label><input name="kub_url" value="${UI.esc(b.kub_url || '')}" placeholder="https://" ${d}/></div>
          <div><label>KT bağlantısı</label><input name="kt_url" value="${UI.esc(b.kt_url || '')}" placeholder="https://" ${d}/></div>
          <div><label><input type="checkbox" name="sgk_kapsaminda" ${b.sgk_kapsaminda ? 'checked' : ''} ${d}/> SGK kapsamında</label></div>
          <div><label>Dermokozmetik kategori</label><select name="derma_ana" ${d}><option value=""></option>${Object.keys(s.derma).map((a) => `<option ${b.derma_ana === a ? 'selected' : ''}>${UI.esc(a)}</option>`).join('')}</select></div>
          <div><label>Alt kategori</label><select name="derma_alt" ${d}><option value=""></option>${(s.derma[b.derma_ana] || []).map((a) => `<option ${b.derma_alt === a ? 'selected' : ''}>${UI.esc(a)}</option>`).join('')}</select></div>
        </div>
        <div><label>SUT / ödeme notu</label><textarea name="sut_notu" rows="4" ${d}>${UI.esc(b.sut_notu || '')}</textarea></div>
        ${yazma ? '<div class="modal-actions"><button type="submit">Kaydet</button></div>' : '<p class="form-ipucu">Düzenleme eczacı ve yönetici içindir.</p>'}
      </form>`;
    }
  };

  const view = {
    async render(container, ctx) {
      const yazma = ['admin', 'eczaci'].includes(ctx.user.rol);
      let secili = null;
      let kart = null;
      let sekme = 'ozet';
      let aramaListesi = [];

      container.innerHTML = `
        <div class="card" id="kart-titck" style="margin-bottom:14px"></div>
        <div style="display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:16px;align-items:start" id="kart-yerlesim">
          <div class="card">
            <input id="kart-ara" placeholder="Ürün adı, barkod, etken madde…" autofocus />
            <div style="margin:8px 0"><label style="font-weight:400"><input type="checkbox" id="kart-titck-ara" /> TİTCK listesinde ara</label></div>
            <div id="kart-liste" style="max-height:62vh;overflow:auto"></div>
          </div>
          <div id="kart-detay"><div class="card empty-state">Soldan bir ürün seçin.</div></div>
        </div>`;

      const titckDurum = async () => {
        const d = await Api.get('/api/titck/durum');
        document.getElementById('kart-titck').innerHTML = d.yuklu
          ? `<b>TİTCK ilaç listesi:</b> ${d.toplam.toLocaleString('tr-TR')} kayıt (${d.aktif.toLocaleString('tr-TR')} aktif, ${d.pasif.toLocaleString('tr-TR')} pasif) · liste tarihi ${UI.esc(d.liste_tarihi || '-')}
             ${yazma ? ' <button class="secondary" id="titck-indir">İnternetten güncelle</button> <label class="secondary" style="display:inline-block;cursor:pointer"><input type="file" id="titck-dosya" accept=".xlsx" hidden />Dosya yükle</label>' : ''}`
          : `<b>TİTCK ilaç listesi yüklü değil.</b> Yüklenince barkoddan ürün bilgisi, ATC kodu, eşdeğerler ve pasif ürün uyarısı çalışır.
             ${yazma ? ' <button id="titck-indir">TİTCK’dan indir</button> <label class="secondary" style="display:inline-block;cursor:pointer"><input type="file" id="titck-dosya" accept=".xlsx" hidden />Dosya yükle (.xlsx)</label>' : ''}`;
        const bitti = (d2) => {
          UI.toast(`Liste güncellendi: ${d2.toplam} kayıt${d2.atc_doldurulan ? `, ${d2.atc_doldurulan} üründe ATC dolduruldu` : ''}`, 'success');
          titckDurum();
          if (secili) kartAc(secili);
        };
        const indir = document.getElementById('titck-indir');
        if (indir) {
          indir.addEventListener('click', async () => {
            indir.disabled = true;
            indir.textContent = 'İndiriliyor… (yarım dakika sürebilir)';
            try {
              bitti(await Api.post('/api/titck/indir', {}));
            } catch (err) {
              UI.toast(err.message, 'error');
              titckDurum();
            }
          });
        }
        const dosya = document.getElementById('titck-dosya');
        if (dosya) {
          dosya.addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            try {
              const yanit = await fetch('/api/titck/yukle', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
              const v = await yanit.json();
              if (!yanit.ok) throw new Error(v.error || 'Yüklenemedi');
              bitti(v);
            } catch (err) {
              UI.toast(err.message, 'error');
            }
          });
        }
      };

      const listeCiz = () => {
        document.getElementById('kart-liste').innerHTML = aramaListesi.length
          ? aramaListesi
              .map((r) =>
                r.titck
                  ? `<div class="satir" style="padding:8px 4px;border-bottom:1px solid var(--border-soft)"><div>${UI.esc(r.ad)}<br><small style="color:var(--text-muted)">${UI.esc(r.atc_kodu || '')} · ${UI.esc(r.firma || '')}</small></div>
                      ${r.ilac_id ? `<button class="secondary" data-kart="${r.ilac_id}">Kart</button>` : yazma ? `<button class="secondary" data-ekle="${UI.esc(r.barkod)}">Ekle</button>` : ''}</div>`
                  : `<div class="satir" data-kart="${r.id}" style="padding:8px 4px;border-bottom:1px solid var(--border-soft);cursor:pointer;${secili === r.id ? 'font-weight:700' : ''}">${UI.esc(r.ad)}<br><small style="color:var(--text-muted)">Stok ${r.stok} · ${UI.tl(r.satis_fiyati)}</small></div>`
              )
              .join('')
          : '<p class="form-ipucu">Sonuç yok.</p>';
      };

      const ara = async () => {
        const q = document.getElementById('kart-ara').value.trim();
        const titck = document.getElementById('kart-titck-ara').checked;
        try {
          if (titck) {
            aramaListesi = q.length >= 2 ? (await Api.get('/api/titck/ara?aktif=1&q=' + encodeURIComponent(q))).map((r) => ({ ...r, titck: true })) : [];
          } else {
            aramaListesi = (await Api.get('/api/ilaclar' + (q ? '?q=' + encodeURIComponent(q) : ''))).slice(0, 60);
          }
        } catch (err) {
          aramaListesi = [];
          UI.toast(err.message, 'error');
        }
        listeCiz();
      };

      const detayCiz = () => {
        const hedef = document.getElementById('kart-detay');
        if (!kart) return;
        hedef.innerHTML = `
          <div class="card">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
              <h3 style="margin:0;flex:1 1 260px">${UI.esc(kart.ilac.ad)}</h3>
              <button class="secondary" data-islem="sepet">Sepete ekle</button>
              <button class="secondary" data-islem="karsilastir">Karşılaştırmaya ekle</button>
            </div>
            <div class="toolbar" id="kart-sekmeler">${SEKMELER.map(([k, e]) => `<button class="secondary${sekme === k ? ' active' : ''}" data-sekme="${k}">${e}</button>`).join('')}</div>
            <div id="kart-icerik">${sekmeHtml[sekme](kart, yazma)}</div>
          </div>`;
        if (sekme === 'maliyet') maliyetBagla();
        if (sekme === 'aile') aileCiz();
        if (sekme === 'tablet' && yazma) formBagla();
      };

      const aileCiz = async () => {
        const hedef = document.getElementById('kart-aile');
        try {
          const a = await Api.get(`/api/ilac-bilgi/${secili}/aile`);
          hedef.innerHTML = a.hatlar.length
            ? a.hatlar
                .map(
                  (h) => `<div style="margin-bottom:14px"><h4 style="margin:0 0 6px">${UI.esc(h.hat)}</h4>${h.dozlar
                    .map(
                      (d) => `<div style="margin:0 0 6px 10px"><span class="badge muted">${UI.esc(d.doz)}</span>
                        <ul style="margin:4px 0 0 0;padding-left:18px">${d.urunler
                          .map(
                            (u) => `<li style="margin:3px 0;${u.secili ? 'font-weight:700' : ''}">${UI.esc(u.ambalaj)}
                              ${u.sgk ? '<span class="badge ok">SGK</span>' : ''}
                              ${u.katalogda ? `<small style="color:var(--text-muted)"> · stok ${u.stok}</small> ${u.secili ? '' : `<button class="secondary" data-kart="${u.id}">Kart</button>`}` : `<small style="color:var(--text-muted)"> · katalogda yok</small> ${yazma ? `<button class="secondary" data-ekle="${UI.esc(u.barkod)}">Kataloğa ekle</button>` : ''}`}</li>`
                          )
                          .join('')}</ul></div>`
                    )
                    .join('')}</div>`
                )
                .join('') + '<p class="form-ipucu">Aile, ürün adının ilk kelimesine (marka) göre katalog ve TİTCK listesinden oluşturulur; doz ve ambalaj addan ayrıştırılır.</p>'
            : '<p class="empty-state">Bu markada başka ürün bulunamadı.</p>';
        } catch (err) {
          hedef.innerHTML = `<p class="form-ipucu">${UI.esc(err.message)}</p>`;
        }
      };

      const maliyetBagla = () => {
        const hesapla = async () => {
          const hedef = document.getElementById('hm-sonuc');
          try {
            const r = await Api.get(`/api/ilac-bilgi/${secili}/hasta-maliyet?hasta=${document.getElementById('hm-hasta').value}&adet=${document.getElementById('hm-adet').value || 1}`);
            hedef.innerHTML = `<table><tbody>
              ${satir('Perakende satış (PSF)', UI.tl(r.psf))}${satir('Fiyat farkı (hasta öder)', UI.tl(r.fiyat_farki))}
              ${satir(`Katılım payı (%${Math.round(r.oran * 100)})`, UI.tl(r.katilim_payi))}
              ${satir('<b>Hasta öder</b>', `<b>${UI.tl(r.hasta_oder)}</b>`)}${satir('SGK öder', UI.tl(r.sgk_oder))}</tbody></table>
              <p class="form-ipucu">${UI.esc(r.uyari)}</p>`;
          } catch (err) {
            hedef.innerHTML = `<p class="form-ipucu">${UI.esc(err.message)}</p>`;
          }
        };
        document.getElementById('hm-hasta').addEventListener('change', hesapla);
        document.getElementById('hm-adet').addEventListener('input', hesapla);
        hesapla();
      };

      const formBagla = () => {
        const form = document.getElementById('kart-form');
        form.derma_ana.addEventListener('change', () => {
          const altlar = kart.secenekler.derma[form.derma_ana.value] || [];
          form.derma_alt.innerHTML = '<option value=""></option>' + altlar.map((a) => `<option>${UI.esc(a)}</option>`).join('');
        });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const veri = {
            atc_kodu: fd.get('atc_kodu'), endikasyon: fd.get('endikasyon'), tablet_renk: [fd.get('renk1'), fd.get('renk2')].filter(Boolean),
            tablet_sekil: fd.get('tablet_sekil'), tablet_yazi: fd.get('tablet_yazi'), tablet_centik: fd.get('tablet_centik'),
            tablet_seffaf: fd.get('tablet_seffaf') === 'on', sgk_kapsaminda: fd.get('sgk_kapsaminda') === 'on',
            imalatci_fiyati: fd.get('imalatci_fiyati'), depocu_fiyati: fd.get('depocu_fiyati'), kamu_fiyati: fd.get('kamu_fiyati'), kamu_odenecek: fd.get('kamu_odenecek'),
            kub_url: fd.get('kub_url'), kt_url: fd.get('kt_url'), sut_notu: fd.get('sut_notu'),
            derma_ana: fd.get('derma_ana') || null, derma_alt: fd.get('derma_alt') || null
          };
          try {
            await Api.put(`/api/ilac-bilgi/${secili}`, veri);
            UI.toast('Kart bilgileri kaydedildi', 'success');
            await kartAc(secili, 'tablet');
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      };

      async function kartAc(id, yeniSekme) {
        secili = id;
        if (yeniSekme) sekme = yeniSekme;
        try {
          kart = await Api.get('/api/ilac-bilgi/' + id);
        } catch (err) {
          UI.toast(err.message, 'error');
          return;
        }
        detayCiz();
        listeCiz();
      }

      container.addEventListener('click', async (e) => {
        const islem = e.target.closest('button[data-islem]');
        if (islem && secili) {
          if (islem.dataset.islem === 'sepet') return EczamSecim.sepeteGonder([secili]);
          const l = EczamSecim.karsilastirmayaEkle([secili]);
          return UI.toast(`Karşılaştırma listesinde ${l.length} ürün var` + (l.length >= 2 ? ' — Müstahzar Karşılaştırma sayfasından açın' : ''), 'success');
        }
        const toplu = e.target.closest('button[data-secili]');
        if (toplu) {
          const idler = [...container.querySelectorAll('.kart-sec:checked')].map((c) => Number(c.value));
          if (!idler.length) return UI.toast('Önce ürün seçin', 'error');
          if (toplu.dataset.secili === 'sepet') return EczamSecim.sepeteGonder(idler);
          EczamSecim.karsilastirmayaEkle([secili, ...idler]);
          location.hash = '#karsilastir';
          return;
        }
        const sek = e.target.closest('button[data-sekme]');
        if (sek) {
          sekme = sek.dataset.sekme;
          return detayCiz();
        }
        const ekle = e.target.closest('[data-ekle]');
        if (ekle && yazma) {
          const fiyat = prompt('Satış fiyatı (TL):');
          if (fiyat === null) return;
          try {
            const r = await Api.post('/api/titck/urune-ekle', { barkod: ekle.dataset.ekle, satis_fiyati: Number(String(fiyat).replace(',', '.')) });
            UI.toast('Kataloğa eklendi', 'success');
            await kartAc(r.id, 'ozet');
            ara();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
          return;
        }
        const k = e.target.closest('[data-kart]');
        if (k) kartAc(Number(k.dataset.kart), 'ozet');
      });
      let zamanlayici;
      document.getElementById('kart-ara').addEventListener('input', () => {
        clearTimeout(zamanlayici);
        zamanlayici = setTimeout(ara, 250);
      });
      document.getElementById('kart-titck-ara').addEventListener('change', ara);

      await titckDurum();
      await ara();
      const baslangic = Number(sessionStorage.getItem('eczam:kart-id'));
      sessionStorage.removeItem('eczam:kart-id');
      if (baslangic) await kartAc(baslangic, 'ozet');
    }
  };

  window.IlacKartiAc = (id) => {
    try {
      sessionStorage.setItem('eczam:kart-id', String(id));
    } catch (e) {
      /* sessionStorage yoksa kart yine acilir, secim yapilmaz */
    }
    location.hash = '#ilac-karti';
  };
  Views.ilacKarti = view;
})();
