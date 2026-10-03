(function () {
  let sepet = [];
  let musteriler = [];
  let sonAramaSonuclari = [];
  let genelKisayolDinleyici = null;
  let onizlemeSayaci = 0;
  let aktifKampanyalar = [];

  function sepetAraToplam() {
    return sepet.reduce((sum, k) => sum + k.adet * k.satis_fiyati, 0);
  }

  function indirimYuzdesiOku() {
    const el = document.getElementById('pos-indirim');
    if (!el) return 0;
    return Math.min(100, Math.max(0, Number(el.value) || 0));
  }

  function sepetiCiz(container) {
    const liste = document.getElementById('sepet-liste');
    liste.innerHTML = sepet.length
      ? sepet
          .map(
            (k, idx) => `
        <div class="cart-item">
          <div class="name">${UI.esc(k.ad)}<br /><small>${UI.tl(k.satis_fiyati)} / adet</small><div class="kampanya-etiketi" data-ilac="${k.ilac_id}"></div></div>
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
    onizlemeGuncelle();
  }

  function toplamlariYaz(h) {
    document.getElementById('pos-ara-toplam').textContent = UI.tl(h.ara_toplam);
    const kampanyaSatiri = document.getElementById('pos-kampanya-satiri');
    kampanyaSatiri.hidden = !(h.kampanya_indirimi > 0);
    document.getElementById('pos-kampanya-tutari').textContent = '-' + UI.tl(h.kampanya_indirimi);
    document.getElementById('pos-indirim-tutari').textContent = '-' + UI.tl(h.indirim_tutari);
    document.getElementById('sepet-toplam').textContent = UI.tl(h.toplam_tutar);
  }

  // Kampanya indirimlerini sunucudaki ayni hesapla gosterir; eski yanitlar yok sayilir
  async function onizlemeGuncelle() {
    if (sepet.length === 0) return;
    const sayac = ++onizlemeSayaci;
    try {
      const h = await Api.post('/api/satislar/onizleme', {
        kalemler: sepet.map((k) => ({ ilac_id: k.ilac_id, adet: k.adet })),
        indirim_yuzdesi: indirimYuzdesiOku()
      });
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
      sepet.push({ ilac_id: ilac.id, ad: ilac.ad, satis_fiyati: ilac.satis_fiyati, adet: 1, mevcutStok: ilac.stok });
    }
    sepetiCiz(container);
  }

  // Karekod okutulunca urunu sepete ekler; SKT'si gecmis kutunun satisini engeller
  async function karekodIleEkle(metin, container) {
    try {
      const sonuc = await UI.karekodSorgula(metin);
      if (!sonuc.ilac) {
        UI.toast(`Karekoddaki ürün kayıtlı değil (barkod ${sonuc.karekod.barkod})`, 'error');
        return;
      }
      if (sonuc.skt_gecmis) {
        UI.toast(`${sonuc.ilac.ad}: kutunun SKT'si geçmiş (${sonuc.karekod.skt}). Satılamaz!`, 'error');
        return;
      }
      sepeteEkle(sonuc.ilac, container);
      const bilgi = [sonuc.karekod.parti_no && `Parti ${sonuc.karekod.parti_no}`, sonuc.karekod.skt && `SKT ${sonuc.karekod.skt}`]
        .filter(Boolean)
        .join(' · ');
      UI.toast(`${sonuc.ilac.ad} eklendi${bilgi ? ' — ' + bilgi : ''}`, 'success');
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
              <td>${UI.esc(i.ad)}</td>
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
      [musteriler, aktifKampanyalar] = await Promise.all([
        Api.get('/api/musteriler'),
        Api.get('/api/kampanyalar/aktif').catch(() => [])
      ]);
      sepet = [];

      container.innerHTML = `
        <div class="pos-layout">
          <div>
            <div class="card">
              <input id="pos-arama" placeholder="İlaç adı, barkod veya karekod okutun..." autofocus />
              <table style="margin-top:12px">
                <thead><tr><th>Ad</th><th>Barkod</th><th class="num">Stok</th><th class="num">Fiyat</th></tr></thead>
                <tbody id="arama-tbody" class="pos-search-results"></tbody>
              </table>
            </div>
          </div>
          <div>
            <div class="card">
              <h3>Sepet</h3>
              ${
                aktifKampanyalar.length
                  ? `<div class="pos-kampanyalar">🏷️ Aktif kampanyalar: ${aktifKampanyalar.map((k) => UI.esc(k.ad)).join(' · ')}</div>`
                  : ''
              }
              <div id="sepet-liste"></div>
              <div class="form-grid" style="margin-top:10px">
                <div>
                  <label>Müşteri (opsiyonel)</label>
                  <select id="pos-musteri">
                    <option value="">- Müşteri seçilmedi -</option>
                    ${musteriler.map((m) => `<option value="${m.id}">${UI.esc(m.ad_soyad)}</option>`).join('')}
                  </select>
                  <div id="pos-saglik-uyarisi"></div>
                </div>
                <div>
                  <label>Ödeme Tipi</label>
                  <select id="pos-odeme">
                    <option value="nakit">Nakit</option>
                    <option value="kredi_karti">Kredi Kartı</option>
                    <option value="sgk">SGK</option>
                    <option value="veresiye">Veresiye (Cari Hesap)</option>
                  </select>
                </div>
                <div>
                  <label>İndirim (%)</label>
                  <input id="pos-indirim" type="number" min="0" max="100" step="1" value="0" />
                </div>
              </div>
              <div class="cart-total" style="font-size:14px;font-weight:400;padding:6px 0;border-top:none">
                <span>Ara Toplam</span><span id="pos-ara-toplam">0,00 TL</span>
              </div>
              <div class="cart-total" id="pos-kampanya-satiri" hidden style="font-size:14px;font-weight:400;padding:0 0 6px;border-top:none;color:var(--success)">
                <span>Kampanya İndirimi</span><span id="pos-kampanya-tutari">-0,00 TL</span>
              </div>
              <div class="cart-total" style="font-size:14px;font-weight:400;padding:0 0 6px;border-top:none;color:var(--danger)">
                <span>İndirim</span><span id="pos-indirim-tutari">-0,00 TL</span>
              </div>
              <div class="cart-total"><span>Toplam</span><span id="sepet-toplam">0,00 TL</span></div>
              <label><input type="checkbox" id="pos-recete" style="width:auto" /> Reçeteli / SGK işlemi</label>
              <button id="pos-tamamla" style="width:100%;margin-top:14px;padding:12px">Satışı Tamamla</button>
              <p style="color:var(--text-muted);font-size:11px;margin-top:8px">
                Kısayollar: <b>F2</b> aramaya odaklan · arama kutusunda <b>Enter</b> ilk sonucu sepete ekler · <b>Ctrl+Enter</b> satışı tamamlar
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

      document.getElementById('arama-tbody').addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const ilac = sonAramaSonuclari.find((i) => i.id === Number(tr.dataset.id));
        if (ilac) sepeteEkle(ilac, container);
      });

      document.getElementById('sepet-liste').addEventListener('input', (e) => {
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

      document.getElementById('pos-musteri').addEventListener('change', async (e) => {
        const uyariDiv = document.getElementById('pos-saglik-uyarisi');
        const musteri = musteriler.find((m) => String(m.id) === e.target.value);
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
            kalemler: sepet.map((k) => ({ ilac_id: k.ilac_id, adet: k.adet }))
          });

          const uyariMetni = satis.kritik_stok_uyarisi.length
            ? '<p style="color:#b8860b">Uyarı: ' +
              satis.kritik_stok_uyarisi.map((u) => `${UI.esc(u.ad)} (kalan: ${u.kalan_stok})`).join(', ') +
              ' kritik stok seviyesinde.</p>'
            : '';

          const indirimSatiri =
            satis.indirim_tutari > 0 || satis.kampanya_indirimi > 0
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

      if (genelKisayolDinleyici) document.removeEventListener('keydown', genelKisayolDinleyici);
      genelKisayolDinleyici = (e) => {
        if (location.hash !== '#satis') return;
        if (e.key === 'F2') {
          e.preventDefault();
          document.getElementById('pos-arama')?.focus();
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
