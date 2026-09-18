(function () {
  let sepet = [];
  let musteriler = [];
  let sonAramaSonuclari = [];

  function sepetToplam() {
    return sepet.reduce((sum, k) => sum + k.adet * k.satis_fiyati, 0);
  }

  function sepetiCiz(container) {
    const liste = document.getElementById('sepet-liste');
    liste.innerHTML = sepet.length
      ? sepet
          .map(
            (k, idx) => `
        <div class="cart-item">
          <div class="name">${UI.esc(k.ad)}<br /><small>${UI.tl(k.satis_fiyati)} / adet</small></div>
          <input type="number" min="1" max="${k.mevcutStok}" value="${k.adet}" data-idx="${idx}" class="sepet-adet" />
          <button class="secondary" data-action="cikar" data-idx="${idx}">Sil</button>
        </div>`
          )
          .join('')
      : '<div class="empty-state">Sepet boş</div>';
    document.getElementById('sepet-toplam').textContent = UI.tl(sepetToplam());
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
      musteriler = await Api.get('/api/musteriler');
      sepet = [];

      container.innerHTML = `
        <div class="pos-layout">
          <div>
            <div class="card">
              <input id="pos-arama" placeholder="İlaç adı veya barkod ile ara..." autofocus />
              <table style="margin-top:12px">
                <thead><tr><th>Ad</th><th>Barkod</th><th class="num">Stok</th><th class="num">Fiyat</th></tr></thead>
                <tbody id="arama-tbody" class="pos-search-results"></tbody>
              </table>
            </div>
          </div>
          <div>
            <div class="card">
              <h3>Sepet</h3>
              <div id="sepet-liste"></div>
              <div class="cart-total"><span>Toplam</span><span id="sepet-toplam">0,00 TL</span></div>
              <div class="form-grid">
                <div>
                  <label>Müşteri (opsiyonel)</label>
                  <select id="pos-musteri">
                    <option value="">- Müşteri seçilmedi -</option>
                    ${musteriler.map((m) => `<option value="${m.id}">${UI.esc(m.ad_soyad)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label>Ödeme Tipi</label>
                  <select id="pos-odeme">
                    <option value="nakit">Nakit</option>
                    <option value="kredi_karti">Kredi Kartı</option>
                    <option value="sgk">SGK</option>
                  </select>
                </div>
              </div>
              <label><input type="checkbox" id="pos-recete" style="width:auto" /> Reçeteli / SGK işlemi</label>
              <button id="pos-tamamla" style="width:100%;margin-top:14px;padding:12px">Satışı Tamamla</button>
            </div>
          </div>
        </div>
      `;

      sepetiCiz(container);
      aramaSonuclariniCiz('');

      let aramaTimer;
      document.getElementById('pos-arama').addEventListener('input', (e) => {
        clearTimeout(aramaTimer);
        aramaTimer = setTimeout(() => aramaSonuclariniCiz(e.target.value.trim()), 200);
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

      document.getElementById('pos-tamamla').addEventListener('click', async () => {
        if (sepet.length === 0) {
          UI.toast('Sepet boş', 'error');
          return;
        }
        const musteriId = document.getElementById('pos-musteri').value;
        const odemeTipi = document.getElementById('pos-odeme').value;
        const sgkRecete = document.getElementById('pos-recete').checked;

        try {
          const satis = await Api.post('/api/satislar', {
            musteri_id: musteriId || null,
            odeme_tipi: odemeTipi,
            sgk_recete: sgkRecete,
            kalemler: sepet.map((k) => ({ ilac_id: k.ilac_id, adet: k.adet }))
          });

          const uyariMetni = satis.kritik_stok_uyarisi.length
            ? '<p style="color:#b8860b">Uyarı: ' +
              satis.kritik_stok_uyarisi.map((u) => `${UI.esc(u.ad)} (kalan: ${u.kalan_stok})`).join(', ') +
              ' kritik stok seviyesinde.</p>'
            : '';

          const modal = UI.openModal(`
            <h3>Satış Tamamlandı #${satis.id}</h3>
            <table>
              <thead><tr><th>Ürün</th><th class="num">Adet</th><th class="num">Tutar</th></tr></thead>
              <tbody>
                ${satis.kalemler.map((k) => `<tr><td>${UI.esc(k.ilac_adi)}</td><td class="num">${k.adet}</td><td class="num">${UI.tl(k.ara_toplam)}</td></tr>`).join('')}
              </tbody>
            </table>
            <div class="cart-total"><span>Toplam</span><span>${UI.tl(satis.toplam_tutar)}</span></div>
            ${uyariMetni}
            <div class="modal-actions"><button data-action="kapat">Tamam</button></div>
          `);
          modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));

          UI.toast('Satış tamamlandı', 'success');
          view.render(container);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    }
  };

  Views.satis = view;
})();
