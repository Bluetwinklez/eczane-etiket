(function () {
  let liste = [];
  let tedarikciler = [];
  let oneriler = [];
  let sepet = [];

  const DURUM_ROZETI = {
    beklemede: '<span class="badge warn">Beklemede</span>',
    gonderildi: '<span class="badge muted">Gönderildi</span>',
    teslim_alindi: '<span class="badge ok">Teslim Alındı</span>',
    iptal: '<span class="badge danger">İptal</span>'
  };

  function yeniSiparisModalGoster(onKaydedildi) {
    const modal = UI.openModal(`
      <h3>Yeni Sipariş Oluştur</h3>
      <div class="form-grid">
        <div>
          <label>Tedarikçi</label>
          <select id="sp-tedarikci">
            ${tedarikciler.map((t) => `<option value="${t.id}">${UI.esc(t.firma_adi)}</option>`).join('')}
          </select>
        </div>
      </div>
      <p style="color:var(--text-muted);font-size:13px">Kritik stok altındaki veya son 30 günün satış hızına göre 7 günden önce bitecek ürünler önerildi. Önerilen adet stoğu 30 günlük ihtiyaca tamamlar.</p>
      <table>
        <thead><tr><th></th><th>İlaç</th><th class="num">Stok</th><th class="num">30 Gün Satış</th><th class="num">Yeter</th><th class="num">Sipariş Adedi</th></tr></thead>
        <tbody id="sp-oneri-tbody">
          ${oneriler
            .map(
              (o) => `<tr>
                <td><input type="checkbox" class="sp-sec" data-id="${o.ilac_id}" style="width:auto" /></td>
                <td>${UI.esc(o.ad)} ${o.neden === 'hizli_tukeniyor' ? '<span class="badge warn">Hızlı tükeniyor</span>' : '<span class="badge danger">Kritik</span>'}</td>
                <td class="num">${o.stok}</td>
                <td class="num">${o.son_satis}</td>
                <td class="num">${o.yetecek_gun === null ? '-' : o.yetecek_gun + ' gün'}</td>
                <td class="num"><input type="number" class="sp-adet" data-id="${o.ilac_id}" min="1" value="${o.onerilen_adet}" style="width:80px" /></td>
              </tr>`
            )
            .join('') || '<tr><td colspan="6" class="empty-state">Sipariş önerisi yok</td></tr>'}
        </tbody>
      </table>
      <div><label>Not (opsiyonel)</label><textarea id="sp-not" rows="2"></textarea></div>
      <div class="modal-actions">
        <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
        <button type="button" data-action="olustur">Siparişi Oluştur</button>
      </div>
    `);

    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('[data-action="olustur"]').addEventListener('click', async () => {
      const kalemler = [];
      modal.querySelectorAll('.sp-sec:checked').forEach((cb) => {
        const id = Number(cb.dataset.id);
        const adetInput = modal.querySelector(`.sp-adet[data-id="${id}"]`);
        kalemler.push({ ilac_id: id, istenen_adet: Number(adetInput.value) });
      });
      if (kalemler.length === 0) {
        UI.toast('En az bir ilaç seçin', 'error');
        return;
      }
      try {
        await Api.post('/api/siparisler', {
          tedarikci_id: Number(modal.querySelector('#sp-tedarikci').value),
          notlar: modal.querySelector('#sp-not').value || null,
          kalemler
        });
        UI.toast('Sipariş oluşturuldu', 'success');
        UI.closeModal(modal);
        onKaydedildi();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  async function detayGoster(siparis) {
    const detay = await Api.get(`/api/siparisler/${siparis.id}`);
    // Teslim alinabilir sipariste her kalem icin parti no / SKT girilebilir
    const teslimAlinabilir = detay.durum === 'beklemede' || detay.durum === 'gonderildi';
    const satirlar = detay.kalemler
      .map(
        (k) => `<tr><td>${UI.esc(k.ilac_adi)}</td><td class="num">${k.istenen_adet}</td><td class="num">${UI.tl(k.tahmini_birim_fiyat)}</td><td class="num">${UI.tl(k.istenen_adet * k.tahmini_birim_fiyat)}</td>${
          teslimAlinabilir
            ? `<td><input class="sp-parti" data-kalem="${k.id}" placeholder="Parti/Lot" style="min-width:90px" /></td><td><input class="sp-skt" data-kalem="${k.id}" type="date" /></td>`
            : ''
        }</tr>`
      )
      .join('');
    const toplam = detay.kalemler.reduce((s, k) => s + k.istenen_adet * k.tahmini_birim_fiyat, 0);

    const aksiyonlar = [];
    if (detay.durum === 'beklemede') aksiyonlar.push('<button data-action="gonderildi">Gönderildi Olarak İşaretle</button>');
    if (detay.durum === 'beklemede' || detay.durum === 'gonderildi')
      aksiyonlar.push('<button data-action="teslim_alindi">Teslim Alındı (Stoğa Ekle)</button>');
    if (detay.durum === 'beklemede') aksiyonlar.push('<button class="danger" data-action="iptal">İptal Et</button>');

    const modal = UI.openModal(`
      <h3 class="modal-genis">Sipariş #${detay.id} — ${DURUM_ROZETI[detay.durum]}</h3>
      <p style="color:var(--text-muted);font-size:13px">${UI.esc(detay.notlar || '')}</p>
      <table>
        <thead><tr><th>İlaç</th><th class="num">Adet</th><th class="num">Birim Fiyat</th><th class="num">Tutar</th>${
          teslimAlinabilir ? '<th>Parti No</th><th>SKT</th>' : ''
        }</tr></thead>
        <tbody>${satirlar}</tbody>
      </table>
      ${teslimAlinabilir ? '<p class="form-ipucu">Parti No ve SKT boş bırakılırsa ilacın varsayılan SKT\'si kullanılır.</p>' : ''}
      <div class="cart-total"><span>Tahmini Toplam</span><span>${UI.tl(toplam)}</span></div>
      <div class="modal-actions">${aksiyonlar.join('')}<button class="secondary" data-action="kapat">Kapat</button></div>
    `);

    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    ['gonderildi', 'teslim_alindi', 'iptal'].forEach((durum) => {
      const btn = modal.querySelector(`[data-action="${durum}"]`);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        try {
          const govde = { durum };
          if (durum === 'teslim_alindi') {
            govde.partiler = {};
            detay.kalemler.forEach((k) => {
              const partiNo = modal.querySelector(`.sp-parti[data-kalem="${k.id}"]`).value.trim();
              const skt = modal.querySelector(`.sp-skt[data-kalem="${k.id}"]`).value;
              if (partiNo || skt) govde.partiler[k.id] = { parti_no: partiNo || null, skt: skt || null };
            });
          }
          await Api.put(`/api/siparisler/${detay.id}/durum`, govde);
          UI.toast('Sipariş durumu güncellendi', 'success');
          UI.closeModal(modal);
          view.render(document.getElementById('content'));
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    });
  }

  const view = {
    async render(container) {
      [liste, tedarikciler, oneriler] = await Promise.all([
        Api.get('/api/siparisler'),
        Api.get('/api/tedarikciler'),
        Api.get('/api/siparisler/oneriler')
      ]);

      container.innerHTML = `
        ${
          oneriler.length
            ? `<div class="card" style="border-left:4px solid var(--warning)">
                <h3>⚠️ ${oneriler.length} ürün için sipariş önerisi var</h3>
                <p style="color:var(--text-muted);font-size:13px;margin:0">Yeni sipariş oluştururken bu ilaçlar otomatik önerilecek.</p>
              </div>`
            : ''
        }
        <div class="toolbar">
          <div class="spacer"></div>
          <button id="yeni-siparis-btn">+ Yeni Sipariş</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Sipariş No</th><th>Tedarikçi</th><th class="num">Kalem Sayısı</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
            <tbody id="siparis-tbody"></tbody>
          </table>
        </div>
      `;

      const tbody = document.getElementById('siparis-tbody');
      tbody.innerHTML = liste.length
        ? liste
            .map(
              (s) => `<tr data-id="${s.id}" style="cursor:pointer">
                <td>#${s.id}</td>
                <td>${UI.esc(s.tedarikci_adi || '-')}</td>
                <td class="num">${s.kalem_sayisi}</td>
                <td>${DURUM_ROZETI[s.durum] || s.durum}</td>
                <td>${UI.tarih(s.olusturma_tarihi)}</td>
                <td class="actions-col"><button class="secondary" data-action="detay" data-id="${s.id}">Detay</button></td>
              </tr>`
            )
            .join('')
        : '<tr><td colspan="6" class="empty-state">Henüz sipariş oluşturulmadı</td></tr>';

      document.getElementById('yeni-siparis-btn').addEventListener('click', () => {
        if (tedarikciler.length === 0) {
          UI.toast('Önce bir tedarikçi ekleyin', 'error');
          return;
        }
        yeniSiparisModalGoster(() => view.render(container));
      });

      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="detay"]');
        const tr = e.target.closest('tr[data-id]');
        if (!btn && !tr) return;
        const id = Number((btn || tr).dataset.id);
        const siparis = liste.find((s) => s.id === id);
        if (siparis) detayGoster(siparis);
      });
    }
  };

  Views.siparisler = view;
})();
