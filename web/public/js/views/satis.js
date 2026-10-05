(function () {
  let sepet = [];
  let sepetKarekod = []; // okutulan karekodlar: { kod, ilac_id }
  let musteriler = [];
  let sonAramaSonuclari = [];
  let genelKisayolDinleyici = null;
  let onizlemeSayaci = 0;
  let etkilesimSayaci = 0;
  let sonEtkilesim = null;
  let aktifKampanyalar = [];

  function sepetAraToplam() {
    return sepet.reduce((sum, k) => sum + k.adet * k.satis_fiyati, 0);
  }

  function indirimYuzdesiOku() {
    const el = document.getElementById('pos-indirim');
    if (!el) return 0;
    const ust = el.max === '' ? 100 : Number(el.max);
    return Math.min(ust, Math.max(0, Number(el.value) || 0));
  }

  function sepetiCiz(container) {
    const liste = document.getElementById('sepet-liste');
    liste.innerHTML = sepet.length
      ? sepet
          .map(
            (k, idx) => `
        <div class="cart-item">
          <div class="name">${UI.esc(k.ad)}<br /><small>${UI.tl(k.satis_fiyati)} / adet</small><div class="kampanya-etiketi" data-ilac="${k.ilac_id}"></div>
            ${['ilac', 'takviye'].includes(k.urun_tipi || 'ilac') ? `<input class="sepet-kullanim" data-idx="${idx}" placeholder="Kullanım (örn. Günde 2x1 tok)" value="${UI.esc(k.kullanim || '')}" />` : ''}</div>
          <input type="number" min="1" max="${k.mevcutStok}" value="${k.adet}" data-idx="${idx}" class="sepet-adet" />
          <button class="secondary" data-action="cikar" data-idx="${idx}">Sil</button>
        </div>`
          )
          .join('')
      : '<div class="empty-state">Sepet boş</div>';

    const araToplam = sepetAraToplam();
    const yuzde = indirimYuzdesiOku();
    const indirimTutari = Math.round(araToplam * (yuzde / 100) * 100) / 100;
    toplamlariYaz({ ara_toplam: araToplam, kampanya_indirimi: 0, indirim_tutari: indirimTutari, toplam_tutar: araToplam - indirimTutari });
    recetePaneliniGuncelle();
    onizlemeGuncelle();
    etkilesimKontrolEt();
  }

  const SEVIYE_ETIKETI = { ciddi: 'Ciddi', orta: 'Orta', hafif: 'Hafif' };

  // Sepetteki urunler (ve secili musterinin son 90 gunluk alimlari) arasindaki etkilesimler
  async function etkilesimKontrolEt() {
    const panel = document.getElementById('pos-etkilesim');
    if (!panel) return;
    const sayac = ++etkilesimSayaci;
    const musteriId = document.getElementById('pos-musteri')?.value || null;
    if (sepet.length === 0) {
      sonEtkilesim = null;
      panel.innerHTML = '';
      return;
    }
    try {
      const sonuc = await Api.post('/api/etkilesimler/kontrol', {
        ilac_ids: sepet.map((k) => k.ilac_id),
        musteri_id: musteriId ? Number(musteriId) : null
      });
      if (sayac !== etkilesimSayaci) return;
      sonEtkilesim = sonuc;
      const satirlar = [
        ...(sonuc.hasta || []).map(
          (h) => `<div class="etkilesim ${h.seviye}"><b>${{ gebelik: 'Gebelik/emzirme', yas: 'Yaş sınırı', yasli: 'İleri yaş' }[h.tur]}:</b> ${UI.esc(h.urun)} — ${UI.esc(h.mesaj)}</div>`
        ),
        ...sonuc.alerji.map(
          (a) => `<div class="etkilesim ciddi"><b>Alerji/sağlık notu:</b> ${UI.esc(a.urun)} (${UI.esc(a.madde)}) — müşteri notunda "${UI.esc(a.eslesen)}" geçiyor.</div>`
        ),
        ...sonuc.etkilesimler.map(
          (e) => `<div class="etkilesim ${e.seviye}"><b>${SEVIYE_ETIKETI[e.seviye]} etkileşim:</b> ${UI.esc(e.urun_a)} + ${UI.esc(e.urun_b)}${
            e.kaynak === 'gecmis' ? ' <small>(müşterinin son 90 gün alımı)</small>' : ''
          }<br /><small>${UI.esc(e.aciklama)}</small></div>`
        ),
        ...sonuc.mukerrer.map(
          (m) => `<div class="etkilesim orta"><b>Mükerrer etken madde:</b> ${UI.esc(m.urun_a)} ve ${UI.esc(m.urun_b)} aynı maddeyi (${UI.esc(m.madde)}) içeriyor${
            m.kaynak === 'gecmis' ? ' <small>(son 90 gün alımı)</small>' : ''
          }.</div>`
        )
      ];
      panel.innerHTML = satirlar.length
        ? satirlar.join('') + '<p class="form-ipucu">Uyarılar sınırlı bir örnek veri setine dayanır; eczacı değerlendirmesinin yerini tutmaz.</p>'
        : '';
    } catch (err) {
      // Etkilesim kontrolu satisi engellemez
    }
  }

  let sonToplam = 0;

  // Sepette receteli urun varsa recete paneli acilir; ozel receteli (kirmizi/yesil/mor/turuncu)
  // urun varsa recete turu ona gore secilir ve kontrollu ilaclar icin uyari gosterilir
  function recetePaneliniGuncelle() {
    const panel = document.getElementById('pos-recete-panel');
    if (!panel) return;
    const receteli = sepet.some((k) => k.receteli);
    const ozel = sepet.find((k) => k.recete_turu);
    panel.hidden = !(receteli || document.getElementById('pos-recete').checked);
    const turSel = document.getElementById('pos-recete-turu');
    if (ozel && turSel.dataset.otomatik !== ozel.recete_turu) {
      turSel.value = ozel.recete_turu;
      turSel.dataset.otomatik = ozel.recete_turu;
    }
    const kontrollu = sepet.filter((k) => ['kirmizi', 'yesil'].includes(k.recete_turu));
    document.getElementById('pos-recete-uyari').innerHTML = kontrollu.length
      ? `<b style="color:var(--danger)">Kontrollü ilaç: ${kontrollu.map((k) => UI.esc(k.ad)).join(', ')}</b> — reçete no, doktor ve hasta TC zorunlu.`
      : 'Reçete bilgisi isteğe bağlıdır; reçete raporuna yansır.';
  }

  function karmaGuncelle() {
    const kutu = document.getElementById('pos-karma');
    if (!kutu) return;
    kutu.hidden = document.getElementById('pos-odeme').value !== 'karma';
    const nakit = Number(document.getElementById('pos-karma-nakit').value) || 0;
    const kart = Math.round((sonToplam - nakit) * 100) / 100;
    const el = document.getElementById('pos-karma-kart');
    el.textContent = UI.tl(Math.max(0, kart));
    el.style.color = kart < 0 ? 'var(--danger)' : '';
  }

  function toplamlariYaz(h) {
    sonToplam = h.toplam_tutar;
    karmaGuncelle();
    document.getElementById('pos-ara-toplam').textContent = UI.tl(h.ara_toplam);
    const kampanyaSatiri = document.getElementById('pos-kampanya-satiri');
    kampanyaSatiri.hidden = !(h.kampanya_indirimi > 0);
    document.getElementById('pos-kampanya-tutari').textContent = '-' + UI.tl(h.kampanya_indirimi);
    document.getElementById('pos-indirim-tutari').textContent = '-' + UI.tl(h.indirim_tutari);
    const puanSatiri = document.getElementById('pos-puan-satiri');
    puanSatiri.hidden = !(h.puan_indirimi > 0);
    document.getElementById('pos-puan-tutari').textContent = '-' + UI.tl(h.puan_indirimi || 0);
    const kazan = document.getElementById('pos-kazanilacak');
    kazan.hidden = !(h.kazanilacak_puan > 0);
    kazan.textContent = `Bu alışverişte kazanılacak puan: ${h.kazanilacak_puan || 0}`;
    const puanKutu = document.getElementById('pos-puan');
    if (h.puan_bakiyesi != null) {
      puanKutu.hidden = false;
      document.getElementById('pos-puan-bakiye').textContent = `(bakiye ${h.puan_bakiyesi})`;
      document.getElementById('pos-puan-kullan').max = h.puan_bakiyesi;
    } else {
      puanKutu.hidden = true;
    }
    document.getElementById('sepet-toplam').textContent = UI.tl(h.toplam_tutar);
  }

  // Kampanya indirimlerini sunucudaki ayni hesapla gosterir; eski yanitlar yok sayilir
  async function onizlemeGuncelle() {
    if (sepet.length === 0) return;
    const sayac = ++onizlemeSayaci;
    try {
      const h = await Api.post('/api/satislar/onizleme', {
        kalemler: sepet.map((k) => ({ ilac_id: k.ilac_id, adet: k.adet })),
        indirim_yuzdesi: indirimYuzdesiOku(),
        musteri_id: document.getElementById('pos-musteri').value || null,
        puan_kullan: Number(document.getElementById('pos-puan-kullan').value) || 0,
        odeme_tipi: document.getElementById('pos-odeme').value,
        sgk_recete: document.getElementById('pos-recete').checked
      });
      if (h.puan_hatasi) UI.toast(h.puan_hatasi, 'error');
      if (sayac !== onizlemeSayaci || !document.getElementById('sepet-toplam')) return;
      h.kalemler.forEach((k) => {
        const el = document.querySelector(`.kampanya-etiketi[data-ilac="${k.ilac_id}"]`);
        if (el) {
          el.innerHTML = k.kampanya_adi
            ? `<span class="badge ok">🏷️ ${UI.esc(k.kampanya_adi)}: -${UI.tl(k.kalem_indirimi)}</span>`
            : '';
        }
      });
      toplamlariYaz(h);
    } catch (err) {
      // Onizleme hatasi satisi engellemez; satis sirasinda sunucu yine dogrular
    }
  }

  function sepeteEkle(ilac, container) {
    const mevcut = sepet.find((k) => k.ilac_id === ilac.id);
    if (mevcut) {
      if (mevcut.adet < ilac.stok) mevcut.adet += 1;
    } else {
      if (ilac.stok <= 0) {
        UI.toast('Bu ilacın stoğu yok', 'error');
        return;
      }
      sepet.push({
        ilac_id: ilac.id,
        ad: ilac.ad,
        satis_fiyati: ilac.satis_fiyati,
        adet: 1,
        mevcutStok: ilac.stok,
        receteli: ilac.receteli,
        recete_turu: ilac.recete_turu || null,
        urun_tipi: ilac.urun_tipi || 'ilac',
        kullanim: ''
      });
    }
    sepetiCiz(container);
  }

  // Karekod okutulunca urunu sepete ekler; SKT'si gecmis kutunun satisini engeller
  async function karekodIleEkle(metin, container) {
    try {
      const sonuc = await UI.karekodSorgula(metin);
      if (sonuc.seri_durum === 'satis') {
        UI.toast(`${sonuc.ilac ? sonuc.ilac.ad : 'Ürün'}: seri ${sonuc.karekod.seri_no} daha önce satılmış görünüyor!`, 'error');
        return;
      }
      if (sepetKarekod.some((k) => k.kod === metin.trim())) {
        UI.toast('Bu karekod sepete zaten eklendi', 'error');
        return;
      }
      if (!sonuc.ilac) {
        UI.toast(`Karekoddaki ürün kayıtlı değil (barkod ${sonuc.karekod.barkod})`, 'error');
        return;
      }
      if (sonuc.skt_gecmis) {
        UI.toast(`${sonuc.ilac.ad}: kutunun SKT'si geçmiş (${sonuc.karekod.skt}). Satılamaz!`, 'error');
        return;
      }
      sepeteEkle(sonuc.ilac, container);
      if (sonuc.karekod.seri_no) sepetKarekod.push({ kod: metin.trim(), ilac_id: sonuc.ilac.id });
      const bilgi = [sonuc.karekod.parti_no && `Parti ${sonuc.karekod.parti_no}`, sonuc.karekod.skt && `SKT ${sonuc.karekod.skt}`]
        .filter(Boolean)
        .join(' · ');
      UI.toast(`${sonuc.ilac.ad} eklendi${bilgi ? ' — ' + bilgi : ''}`, 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  // Stokta olmayan urun icin ayni etken maddeli muadilleri listeler
  async function muadilleriGoster(ilacId, container) {
    const ilac = sonAramaSonuclari.find((i) => i.id === ilacId);
    try {
      const liste = await Api.get(`/api/ilaclar/${ilacId}/muadiller`);
      const modal = UI.openModal(`
        <h3>Muadil Ürünler</h3>
        <p class="form-ipucu">${UI.esc(ilac ? ilac.ad : '')} — etken madde: <b>${UI.esc(ilac ? ilac.etken_madde : '')}</b>. Muadil değişimi reçete ve hekim kuralına uygun olmalıdır.</p>
        ${
          liste.length
            ? `<table><thead><tr><th>Ürün</th><th class="num">Stok</th><th class="num">Fiyat</th><th></th></tr></thead><tbody>
              ${liste
                .map(
                  (m) => `<tr><td>${UI.esc(m.ad)}${m.raf_konumu ? ` <span class="badge muted">📍 ${UI.esc(m.raf_konumu)}</span>` : ''}</td>
                    <td class="num">${m.stok}</td><td class="num">${UI.tl(m.satis_fiyati)}</td>
                    <td class="actions-col">${m.stok > 0 ? `<button data-ekle="${m.id}">Sepete ekle</button>` : '<span class="badge danger">Stok yok</span>'}</td></tr>`
                )
                .join('')}</tbody></table>`
            : '<div class="empty-state">Aynı etken maddeye sahip başka ürün kayıtlı değil.</div>'
        }
        <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Kapat</button></div>
      `);
      modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
      modal.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ekle]');
        if (!btn) return;
        const m = liste.find((x) => x.id === Number(btn.dataset.ekle));
        sepeteEkle(m, container);
        UI.closeModal(modal);
        UI.toast(`${m.ad} sepete eklendi`, 'success');
      });
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  async function aramaSonuclariniCiz(q) {
    const sonuclar = q ? await Api.get('/api/ilaclar?q=' + encodeURIComponent(q)) : [];
    sonAramaSonuclari = sonuclar;
    const tbody = document.getElementById('arama-tbody');
    tbody.innerHTML = sonuclar.length
      ? sonuclar
          .map(
            (i) => `<tr data-id="${i.id}">
              <td>${UI.esc(i.ad)}${i.raf_konumu ? ` <span class="badge muted" title="Raf konumu">📍 ${UI.esc(i.raf_konumu)}</span>` : ''}${
                i.stok <= 0 && i.etken_madde ? ` <button type="button" class="secondary muadil-btn" data-muadil="${i.id}">Muadil bul</button>` : ''
              }</td>
              <td>${UI.esc(i.barkod || '-')}</td>
              <td class="num">${i.stok}</td>
              <td class="num">${UI.tl(i.satis_fiyati)}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="4" class="empty-state">Aramak için ilaç adı veya barkod yazın</td></tr>';
  }

  const view = {
    async render(container) {
      let ayarlar;
      let hizliUrunler;
      [musteriler, aktifKampanyalar, ayarlar, hizliUrunler] = await Promise.all([
        Api.get('/api/musteriler'),
        Api.get('/api/kampanyalar/aktif').catch(() => []),
        Api.get('/api/ayarlar').catch(() => ({ kasiyer_indirim_limiti: 100 })),
        Api.get('/api/ilaclar?hizli=1').catch(() => [])
      ]);
      const indirimLimiti = CURRENT_USER.rol === 'kasiyer' ? ayarlar.kasiyer_indirim_limiti : 100;
      sepet = [];
      sepetKarekod = [];

      container.innerHTML = `
        <div class="pos-layout">
          <div>
            <div class="card">
              ${
                hizliUrunler.length
                  ? `<div class="hizli-tuslar" aria-label="Hızlı ürünler">${hizliUrunler
                      .slice(0, 12)
                      .map((u) => `<button type="button" class="hizli-tus" data-hizli="${u.id}" ${u.stok <= 0 ? 'disabled title="Stok yok"' : ''}><b>${UI.esc(u.ad)}</b><span>${UI.tl(u.satis_fiyati)}</span></button>`)
                      .join('')}</div>`
                  : ''
              }
              <input id="pos-arama" placeholder="İlaç adı, barkod veya karekod okutun..." autofocus />
              <table style="margin-top:12px">
                <thead><tr><th>Ad</th><th>Barkod</th><th class="num">Stok</th><th class="num">Fiyat</th></tr></thead>
                <tbody id="arama-tbody" class="pos-search-results"></tbody>
              </table>
            </div>
          </div>
          <div>
            <div class="card">
              <div class="toolbar" style="margin:0 0 6px">
                <h3 style="margin:0">Sepet</h3>
                <div class="spacer"></div>
                <button class="secondary" id="pos-beklet" title="Sepeti beklet (F8)">⏸ Beklet</button>
                <button class="secondary" id="pos-bekleyenler">Bekleyenler <span class="badge muted" id="pos-bekleyen-sayi">0</span></button>
              </div>
              ${
                aktifKampanyalar.length
                  ? `<div class="pos-kampanyalar">🏷️ Aktif kampanyalar: ${aktifKampanyalar.map((k) => UI.esc(k.ad)).join(' · ')}</div>`
                  : ''
              }
              <div id="sepet-liste"></div>
              <div class="form-grid" style="margin-top:10px">
                <div>
                  <label>Müşteri (opsiyonel)</label>
                  <div class="musteri-secim">
                    <select id="pos-musteri">
                      <option value="">- Müşteri seçilmedi -</option>
                      ${musteriler.map((m) => `<option value="${m.id}">${UI.esc(m.ad_soyad)}</option>`).join('')}
                    </select>
                    <button type="button" class="secondary" id="pos-musteri-ekle" title="Yeni müşteri ekle" aria-label="Yeni müşteri ekle">+</button>
                  </div>
                  <div id="pos-saglik-uyarisi"></div>
                  <div id="pos-puan" hidden style="margin-top:6px">
                    <label>Puan Kullan <span class="form-ipucu" id="pos-puan-bakiye"></span></label>
                    <div style="display:flex;gap:6px"><input id="pos-puan-kullan" type="number" min="0" step="1" value="0" /><button type="button" class="secondary" id="pos-puan-tumu">Tümü</button></div>
                  </div>
                </div>
                <div>
                  <label>Ödeme Tipi</label>
                  <select id="pos-odeme">
                    <option value="nakit">Nakit</option>
                    <option value="kredi_karti">Kredi Kartı</option>
                    <option value="sgk">SGK</option>
                    <option value="veresiye">Veresiye (Cari Hesap)</option>
                    <option value="karma">Nakit + Kart (bölünmüş)</option>
                  </select>
                  <div id="pos-karma" hidden style="margin-top:6px">
                    <label>Nakit Alınan</label>
                    <input id="pos-karma-nakit" type="number" min="0" step="0.01" placeholder="0,00" />
                    <p class="form-ipucu" style="margin:4px 0 0">Karttan: <b id="pos-karma-kart">0,00 TL</b></p>
                  </div>
                </div>
                <div>
                  <label>İndirim (%)</label>
                  <input id="pos-indirim" type="number" min="0" max="${indirimLimiti}" step="1" value="0" title="${indirimLimiti < 100 ? `Kasiyer indirim limiti: %${indirimLimiti}` : ''}" />
                </div>
              </div>
              <div id="pos-etkilesim"></div>
              <div class="cart-total" style="font-size:14px;font-weight:400;padding:6px 0;border-top:none">
                <span>Ara Toplam</span><span id="pos-ara-toplam">0,00 TL</span>
              </div>
              <div class="cart-total" id="pos-kampanya-satiri" hidden style="font-size:14px;font-weight:400;padding:0 0 6px;border-top:none;color:var(--success)">
                <span>Kampanya İndirimi</span><span id="pos-kampanya-tutari">-0,00 TL</span>
              </div>
              <div class="cart-total" style="font-size:14px;font-weight:400;padding:0 0 6px;border-top:none;color:var(--danger)">
                <span>İndirim</span><span id="pos-indirim-tutari">-0,00 TL</span>
              </div>
              <div class="cart-total" id="pos-puan-satiri" hidden style="font-size:14px;font-weight:400;padding:0 0 6px;border-top:none;color:var(--success)">
                <span>Puan İndirimi</span><span id="pos-puan-tutari">-0,00 TL</span>
              </div>
              <p class="form-ipucu" id="pos-kazanilacak" hidden style="margin:0 0 6px"></p>
              <div class="cart-total"><span>Toplam</span><span id="sepet-toplam">0,00 TL</span></div>
              <label><input type="checkbox" id="pos-recete" style="width:auto" /> Reçeteli / SGK işlemi</label>
              <div class="recete-panel" id="pos-recete-panel" hidden>
                <div id="pos-recete-uyari" class="form-ipucu" style="margin-top:0"></div>
                <div class="form-grid">
                  <div><label>Reçete No</label><input id="pos-recete-no" /></div>
                  <div><label>Reçete Türü</label><select id="pos-recete-turu">${Object.entries(UI.RECETE_TURLERI).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
                  <div><label>Doktor</label><input id="pos-doktor" /></div>
                  <div><label>Reçete Tarihi</label><input id="pos-recete-tarihi" type="date" /></div>
                  <div><label>Hasta TC</label><input id="pos-hasta-tc" maxlength="11" placeholder="Müşteri seçiliyse kaydındaki TC" /></div>
                </div>
              </div>
              <button id="pos-tamamla" style="width:100%;margin-top:14px;padding:12px">Satışı Tamamla</button>
              <p style="color:var(--text-muted);font-size:11px;margin-top:8px">
                Kısayollar: <b>F2</b> aramaya odaklan · arama kutusunda <b>Enter</b> ilk sonucu sepete ekler · <b>Ctrl+Enter</b> satışı tamamlar · <b>F8</b> sepeti beklet
              </p>
            </div>
          </div>
        </div>
      `;

      sepetiCiz(container);
      aramaSonuclariniCiz('');

      let aramaTimer;
      const aramaInput = document.getElementById('pos-arama');
      aramaInput.addEventListener('input', (e) => {
        clearTimeout(aramaTimer);
        // Karekod okutuluyorsa okuyucunun Enter'ini bekle, ara sonuc listesi gosterme
        if (UI.karekodaBenziyor(e.target.value)) return;
        aramaTimer = setTimeout(() => aramaSonuclariniCiz(e.target.value.trim()), 200);
      });
      aramaInput.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        if (UI.karekodaBenziyor(aramaInput.value)) {
          e.preventDefault();
          clearTimeout(aramaTimer);
          await karekodIleEkle(aramaInput.value, container);
          aramaInput.value = '';
          return;
        }
        if (sonAramaSonuclari.length > 0) {
          e.preventDefault();
          sepeteEkle(sonAramaSonuclari[0], container);
        }
      });

      container.querySelectorAll('[data-hizli]').forEach((b) =>
        b.addEventListener('click', () => {
          const u = hizliUrunler.find((x) => x.id === Number(b.dataset.hizli));
          if (u) sepeteEkle(u, container);
        })
      );

      // Kasadan cikmadan hizli musteri kaydi: ad ve telefon yeterli
      document.getElementById('pos-musteri-ekle').addEventListener('click', () => {
        const modal = UI.openModal(`
          <h3>Hızlı Müşteri Ekle</h3>
          <form id="hizli-musteri-form">
            <div class="form-grid">
              <div><label>Ad Soyad</label><input name="ad_soyad" required autofocus /></div>
              <div><label>Telefon</label><input name="telefon" inputmode="tel" /></div>
            </div>
            <div><label><input type="checkbox" name="ileti_izni" style="width:auto" /> Kampanya SMS'i almayı kabul ediyor (İYS)</label></div>
            <p class="form-ipucu">Diğer bilgiler (doğum tarihi, sağlık notu) sonradan Müşteriler sayfasından eklenebilir.</p>
            <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Vazgeç</button><button type="submit">Kaydet ve Seç</button></div>
          </form>`);
        modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
        modal.querySelector('#hizli-musteri-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target;
          try {
            const m = await Api.post('/api/musteriler', { ad_soyad: f.ad_soyad.value, telefon: f.telefon.value || null, ileti_izni: f.ileti_izni.checked });
            musteriler.push(m);
            const sec = document.getElementById('pos-musteri');
            sec.insertAdjacentHTML('beforeend', `<option value="${m.id}">${UI.esc(m.ad_soyad)}</option>`);
            sec.value = String(m.id);
            sec.dispatchEvent(new Event('change'));
            UI.closeModal(modal);
            UI.toast(`${m.ad_soyad} eklendi ve seçildi`, 'success');
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      });

      document.getElementById('arama-tbody').addEventListener('click', (e) => {
        const muadilBtn = e.target.closest('[data-muadil]');
        if (muadilBtn) {
          muadilleriGoster(Number(muadilBtn.dataset.muadil), container);
          return;
        }
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const ilac = sonAramaSonuclari.find((i) => i.id === Number(tr.dataset.id));
        if (ilac) sepeteEkle(ilac, container);
      });

      document.getElementById('sepet-liste').addEventListener('input', (e) => {
        if (e.target.classList.contains('sepet-kullanim')) {
          sepet[Number(e.target.dataset.idx)].kullanim = e.target.value;
          return;
        }
        if (!e.target.classList.contains('sepet-adet')) return;
        const idx = Number(e.target.dataset.idx);
        let val = Number(e.target.value) || 1;
        val = Math.max(1, Math.min(val, sepet[idx].mevcutStok));
        sepet[idx].adet = val;
        sepetiCiz(container);
      });

      document.getElementById('sepet-liste').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action="cikar"]');
        if (!btn) return;
        sepet.splice(Number(btn.dataset.idx), 1);
        sepetiCiz(container);
      });

      document.getElementById('pos-indirim').addEventListener('input', () => sepetiCiz(container));
      document.getElementById('pos-odeme').addEventListener('change', () => {
        karmaGuncelle();
        onizlemeGuncelle();
      });
      document.getElementById('pos-recete').addEventListener('change', () => {
        recetePaneliniGuncelle();
        onizlemeGuncelle();
      });
      let puanZamanlayici;
      document.getElementById('pos-puan-kullan').addEventListener('input', () => {
        clearTimeout(puanZamanlayici);
        puanZamanlayici = setTimeout(onizlemeGuncelle, 250);
      });
      document.getElementById('pos-puan-tumu').addEventListener('click', () => {
        const inp = document.getElementById('pos-puan-kullan');
        inp.value = inp.max || 0;
        onizlemeGuncelle();
      });
      document.getElementById('pos-karma-nakit').addEventListener('input', karmaGuncelle);

      document.getElementById('pos-musteri').addEventListener('change', async (e) => {
        document.getElementById('pos-puan-kullan').value = 0;
        onizlemeGuncelle();
        const uyariDiv = document.getElementById('pos-saglik-uyarisi');
        const musteri = musteriler.find((m) => String(m.id) === e.target.value);
        etkilesimKontrolEt();
        uyariDiv.innerHTML =
          musteri && musteri.saglik_notu
            ? `<p style="background:var(--danger-soft);color:var(--danger);padding:8px 10px;border-radius:var(--radius-sm);font-size:12px;margin-top:6px">⚕ ${UI.esc(musteri.saglik_notu)}</p>`
            : '';
        if (musteri) {
          // Veresiye bakiyesini ve limitini goster
          const detay = await Api.get(`/api/musteriler/${musteri.id}`).catch(() => null);
          if (detay && document.getElementById('pos-musteri').value === String(musteri.id) && (detay.veresiye_bakiyesi > 0 || detay.veresiye_limiti != null)) {
            uyariDiv.insertAdjacentHTML(
              'beforeend',
              `<p class="pos-cari-bilgi">Veresiye borcu: <b>${UI.tl(detay.veresiye_bakiyesi)}</b>${
                detay.veresiye_limiti != null ? ` · Limit: ${UI.tl(detay.veresiye_limiti)}` : ''
              }</p>`
            );
          }
        }
      });

      document.getElementById('pos-tamamla').addEventListener('click', async () => {
        if (sepet.length === 0) {
          UI.toast('Sepet boş', 'error');
          return;
        }
        const musteriId = document.getElementById('pos-musteri').value;
        const odemeTipi = document.getElementById('pos-odeme').value;
        if (
          sonEtkilesim &&
          (sonEtkilesim.alerji.length ||
            sonEtkilesim.etkilesimler.some((x) => x.seviye === 'ciddi') ||
            (sonEtkilesim.hasta || []).some((x) => x.seviye === 'ciddi'))
        ) {
          const onay = window.confirm(
            'Sepette CİDDİ etkileşim, alerji, gebelik veya yaş uyarısı var. Eczacı değerlendirmesini yaptıysanız satışa devam etmek istiyor musunuz?'
          );
          if (!onay) return;
        }
        let odemeler;
        if (odemeTipi === 'karma') {
          const nakit = Math.round((Number(document.getElementById('pos-karma-nakit').value) || 0) * 100) / 100;
          const kart = Math.round((sonToplam - nakit) * 100) / 100;
          if (nakit <= 0 || kart <= 0) {
            UI.toast('Bölünmüş ödemede nakit tutarı 0 ile toplam arasında olmalı', 'error');
            document.getElementById('pos-karma-nakit').focus();
            return;
          }
          odemeler = [
            { odeme_tipi: 'nakit', tutar: nakit },
            { odeme_tipi: 'kredi_karti', tutar: kart }
          ];
        }
        if (odemeTipi === 'veresiye' && !musteriId) {
          UI.toast('Veresiye satış için müşteri seçin', 'error');
          document.getElementById('pos-musteri').focus();
          return;
        }
        const sgkRecete = document.getElementById('pos-recete').checked;

        try {
          const satis = await Api.post('/api/satislar', {
            musteri_id: musteriId || null,
            odeme_tipi: odemeTipi,
            sgk_recete: sgkRecete,
            indirim_yuzdesi: indirimYuzdesiOku(),
            odemeler,
            puan_kullan: Number(document.getElementById('pos-puan-kullan').value) || 0,
            ...(document.getElementById('pos-recete-panel').hidden
              ? {}
              : {
                  recete_no: document.getElementById('pos-recete-no').value || null,
                  recete_turu: document.getElementById('pos-recete-turu').value || null,
                  doktor_adi: document.getElementById('pos-doktor').value || null,
                  recete_tarihi: document.getElementById('pos-recete-tarihi').value || null,
                  hasta_tc: document.getElementById('pos-hasta-tc').value || null
                }),
            karekodlar: sepetKarekod.filter((k) => sepet.some((s) => s.ilac_id === k.ilac_id)).map((k) => k.kod),
            kalemler: sepet.map((k) => ({ ilac_id: k.ilac_id, adet: k.adet, kullanim: k.kullanim || null }))
          });
          sepetKarekod = [];

          const uyariMetni = satis.kritik_stok_uyarisi.length
            ? '<p style="color:var(--warning)">Uyarı: ' +
              satis.kritik_stok_uyarisi.map((u) => `${UI.esc(u.ad)} (kalan: ${u.kalan_stok})`).join(', ') +
              ' kritik stok seviyesinde.</p>'
            : '';

          const indirimSatiri =
            satis.indirim_tutari > 0 || satis.kampanya_indirimi > 0 || satis.puan_indirimi > 0
              ? `<div class="cart-total" style="font-size:13px;font-weight:400;padding:4px 0;border-top:none">
                   <span>Ara Toplam</span><span>${UI.tl(satis.ara_toplam)}</span>
                 </div>
                 ${
                   satis.kampanya_indirimi > 0
                     ? `<div class="cart-total" style="font-size:13px;font-weight:400;padding:0 0 4px;border-top:none;color:var(--success)">
                          <span>Kampanya İndirimi</span><span>-${UI.tl(satis.kampanya_indirimi)}</span>
                        </div>`
                     : ''
                 }
                 ${
                   satis.indirim_tutari > 0
                     ? `<div class="cart-total" style="font-size:13px;font-weight:400;padding:0 0 4px;border-top:none;color:var(--danger)">
                          <span>İndirim</span><span>-${UI.tl(satis.indirim_tutari)}</span>
                        </div>`
                     : ''
                 }
                 ${
                   satis.puan_indirimi > 0
                     ? `<div class="cart-total" style="font-size:13px;font-weight:400;padding:0 0 4px;border-top:none;color:var(--success)">
                          <span>Puan (${satis.kullanilan_puan})</span><span>-${UI.tl(satis.puan_indirimi)}</span>
                        </div>`
                     : ''
                 }`
              : '';

          const modal = UI.openModal(`
            <div id="fis-icerik">
              <h3>Satış Tamamlandı #${satis.id}</h3>
              <p style="color:var(--text-muted);font-size:12px">${UI.tarih(satis.tarih)}</p>
              <table>
                <thead><tr><th>Ürün</th><th class="num">Adet</th><th class="num">Tutar</th></tr></thead>
                <tbody>
                  ${satis.kalemler
                    .map(
                      (k) => `<tr><td>${UI.esc(k.ilac_adi)}${
                        k.kampanya_adi ? `<br /><small style="color:var(--success)">${UI.esc(k.kampanya_adi)} (-${UI.tl(k.kalem_indirimi)})</small>` : ''
                      }</td><td class="num">${k.adet}</td><td class="num">${UI.tl(k.birim_fiyat * k.adet)}</td></tr>`
                    )
                    .join('')}
                </tbody>
              </table>
              ${indirimSatiri}
              <div class="cart-total"><span>Toplam</span><span>${UI.tl(satis.toplam_tutar)}</span></div>
              ${
                satis.odemeler && satis.odemeler.length
                  ? `<p class="form-ipucu">Ödeme: ${satis.odemeler.map((o) => `${o.odeme_tipi === 'nakit' ? 'Nakit' : 'Kart'} ${UI.tl(o.tutar)}`).join(' + ')}</p>`
                  : ''
              }
              ${satis.kazanilan_puan > 0 ? `<p class="form-ipucu">Kazanılan puan: <b>${satis.kazanilan_puan}</b></p>` : ''}
              ${uyariMetni}
            </div>
            <div class="modal-actions"><button class="secondary" data-action="yazdir">Fiş Yazdır</button><button data-action="kapat">Tamam</button></div>
          `);
          modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
          modal.querySelector('[data-action="yazdir"]').addEventListener('click', () => window.print());

          UI.toast('Satış tamamlandı', 'success');
          view.render(container);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });

      const bekleyenSayisiniGuncelle = async () => {
        const liste = await Api.get('/api/satislar/bekleyen').catch(() => []);
        const el = document.getElementById('pos-bekleyen-sayi');
        if (el) {
          el.textContent = liste.length;
          el.className = 'badge ' + (liste.length ? 'warn' : 'muted');
        }
        return liste;
      };
      bekleyenSayisiniGuncelle();

      const sepetiBeklet = async () => {
        if (!sepet.length) {
          UI.toast('Sepet boş', 'error');
          return;
        }
        const musteriSel = document.getElementById('pos-musteri');
        const musteriAdi = musteriSel.value ? musteriSel.selectedOptions[0].textContent : '';
        const etiket = window.prompt('Bekleyen sepet için kısa not (örn. müşteri adı):', musteriAdi);
        if (etiket === null) return;
        try {
          await Api.post('/api/satislar/bekleyen', {
            etiket,
            veri: {
              sepet,
              musteri_id: musteriSel.value || null,
              odeme_tipi: document.getElementById('pos-odeme').value,
              indirim_yuzdesi: indirimYuzdesiOku(),
              sgk_recete: document.getElementById('pos-recete').checked
            }
          });
          UI.toast('Sepet bekletildi', 'success');
          view.render(container);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      };

      document.getElementById('pos-beklet').addEventListener('click', sepetiBeklet);
      document.getElementById('pos-bekleyenler').addEventListener('click', async () => {
        const liste = await bekleyenSayisiniGuncelle();
        const modal = UI.openModal(`
          <h3>Bekleyen Sepetler</h3>
          ${
            liste.length
              ? `<table><thead><tr><th>Not</th><th>Ürünler</th><th>Kasiyer</th><th>Saat</th><th></th></tr></thead><tbody>${liste
                  .map(
                    (b) => `<tr><td>${UI.esc(b.etiket || '-')}</td>
                      <td>${b.veri.sepet.map((k) => `${UI.esc(k.ad)} ×${k.adet}`).join(', ')}</td>
                      <td>${UI.esc(b.kullanici_adi || '-')}</td><td>${UI.tarih(b.tarih).slice(11)}</td>
                      <td class="actions-col"><button data-geri="${b.id}">Geri Al</button><button class="danger secondary" data-sil="${b.id}">Sil</button></td></tr>`
                  )
                  .join('')}</tbody></table>`
              : '<div class="empty-state">Bekleyen sepet yok</div>'
          }
          <div class="modal-actions"><button class="secondary" data-action="kapat">Kapat</button></div>`);
        modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
        modal.addEventListener('click', async (e) => {
          const geri = e.target.closest('[data-geri]');
          const sil = e.target.closest('[data-sil]');
          if (geri) {
            if (sepet.length && !window.confirm('Mevcut sepet silinecek. Devam edilsin mi? (Önce bekletmek için Vazgeç deyin)')) return;
            try {
              const veri = await Api.post(`/api/satislar/bekleyen/${geri.dataset.geri}/geri-al`, {});
              UI.closeModal(modal);
              sepet = veri.sepet;
              document.getElementById('pos-musteri').value = veri.musteri_id || '';
              document.getElementById('pos-musteri').dispatchEvent(new Event('change'));
              document.getElementById('pos-odeme').value = veri.odeme_tipi || 'nakit';
              document.getElementById('pos-indirim').value = veri.indirim_yuzdesi || 0;
              document.getElementById('pos-recete').checked = Boolean(veri.sgk_recete);
              sepetiCiz(container);
              bekleyenSayisiniGuncelle();
              UI.toast('Sepet geri alındı', 'success');
            } catch (err) {
              UI.toast(err.message, 'error');
            }
          } else if (sil) {
            if (!window.confirm('Bekleyen sepet silinsin mi?')) return;
            await Api.del(`/api/satislar/bekleyen/${sil.dataset.sil}`);
            sil.closest('tr').remove();
            bekleyenSayisiniGuncelle();
          }
        });
      });

      if (genelKisayolDinleyici) document.removeEventListener('keydown', genelKisayolDinleyici);
      genelKisayolDinleyici = (e) => {
        if (location.hash !== '#satis') return;
        if (e.key === 'F2') {
          e.preventDefault();
          document.getElementById('pos-arama')?.focus();
        } else if (e.key === 'F8') {
          e.preventDefault();
          document.getElementById('pos-beklet')?.click();
        } else if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          document.getElementById('pos-tamamla')?.click();
        }
      };
      document.addEventListener('keydown', genelKisayolDinleyici);
    }
  };

  Views.satis = view;
})();
