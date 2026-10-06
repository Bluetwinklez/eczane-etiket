// Depoya iade: miadi yaklasan partiler depoya gore gruplanir; secilenler iade edilir ve iade formu yazdirilir
(function () {
  const kalanRozet = (k) =>
    k.gecti
      ? `<span class="badge danger">Miadı geçti (${-k.kalan_gun} gün)</span>`
      : `<span class="badge ${k.kalan_gun <= 30 ? 'danger' : k.kalan_gun <= 90 ? 'warn' : 'muted'}">${k.kalan_gun} gün</span>`;

  async function formAc(id) {
    const d = await Api.get('/api/depo-iade/' + id);
    const modal = UI.openModal(`
      <div class="modal-genis yazdirilabilir">
        <h3 style="margin:0">İADE FORMU</h3>
        <p style="margin:4px 0 12px">No: <b>${UI.esc(d.belge_no || 'IADE-' + d.id)}</b> · Tarih: ${UI.esc(d.tarih.slice(0, 10))}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><b>İade eden</b><br>${UI.esc(d.sube_adi)}<br><small>${UI.esc(d.sube_adres || '')} ${UI.esc(d.sube_telefon || '')}</small></div>
          <div><b>Depo</b><br>${UI.esc(d.firma_adi || 'Belirtilmemiş')}<br><small>${d.vergi_no ? 'VKN ' + UI.esc(d.vergi_no) : ''} ${UI.esc(d.tedarikci_telefon || '')}</small></div>
        </div>
        <table><thead><tr><th>Ürün</th><th>Barkod</th><th>Parti</th><th>SKT</th><th class="num">Adet</th><th class="num">Birim</th><th class="num">Tutar</th></tr></thead><tbody>
          ${d.kalemler.map((k) => `<tr><td>${UI.esc(k.ad)}</td><td>${UI.esc(k.barkod || '-')}</td><td>${UI.esc(k.parti_no || '-')}</td><td>${UI.esc(k.skt || '-')}</td><td class="num">${k.adet}</td><td class="num">${UI.tl(k.birim_maliyet)}</td><td class="num">${UI.tl(k.tutar)}</td></tr>`).join('')}
          <tr><td colspan="6"><b>Toplam</b></td><td class="num"><b>${UI.tl(d.toplam)}</b></td></tr>
        </tbody></table>
        ${d.aciklama ? `<p>${UI.esc(d.aciklama)}</p>` : ''}
        <p class="form-ipucu">Karekodlu ürünlerin İTS iade bildirimini yapmayı unutmayın.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:40px">
          <div>Teslim eden: ${UI.esc(d.kullanici_adi || '')}<br><br>İmza</div><div>Teslim alan (depo)<br><br>İmza</div>
        </div>
      </div>
      <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Kapat</button><button type="button" data-action="yazdir">Yazdır</button></div>`);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('[data-action="yazdir"]').addEventListener('click', () => window.print());
  }

  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="card" style="margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <label style="margin:0">Miadına</label>
          <select id="di-gun" style="width:auto">${[60, 90, 120, 180, 365].map((g) => `<option value="${g}" ${g === 120 ? 'selected' : ''}>${g} gün</option>`).join('')}</select>
          <span>veya daha az kalan ürünler</span>
          <span class="form-ipucu" style="margin:0">Depo, ürünün parti numarasıyla yapılan mal kabulden bulunur; yoksa son alındığı depo varsayılır.</span>
        </div>
        <div id="di-gruplar"></div>
        <div class="card"><h3 style="margin-top:0">Geçmiş iadeler</h3><div id="di-gecmis"></div></div>`;

      let veri = null;
      const ciz = () => {
        document.getElementById('di-gruplar').innerHTML = veri.gruplar.length
          ? veri.gruplar
              .map(
                (g, gi) => `<div class="card" style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
              <h3 style="margin:0">${UI.esc(g.tedarikci_adi)}</h3><span>${g.kalemler.length} parti · <b>${UI.tl(g.toplam)}</b></span>
            </div>
            <table style="margin-top:8px"><thead><tr><th><input type="checkbox" class="di-hepsi" data-g="${gi}" style="width:auto" /></th><th>Ürün</th><th>Parti</th><th>SKT</th><th>Kalan</th><th class="num">Stok</th><th class="num">İade adedi</th><th class="num">Birim maliyet</th></tr></thead><tbody>
              ${g.kalemler
                .map(
                  (k) => `<tr><td><input type="checkbox" class="di-sec" data-g="${gi}" data-parti="${k.parti_id}" style="width:auto" /></td>
                  <td>${UI.esc(k.ad)}${k.eslesme === 'son_alis' ? ' <small class="form-ipucu" title="Parti numarasıyla mal kabul bulunamadı">(son alış deposu)</small>' : ''}</td>
                  <td>${UI.esc(k.parti_no || '-')}</td><td>${UI.esc(k.skt)}</td><td>${kalanRozet(k)}</td><td class="num">${k.miktar}</td>
                  <td class="num"><input type="number" class="di-adet" data-parti="${k.parti_id}" min="1" max="${k.miktar}" value="${k.miktar}" style="width:70px" /></td>
                  <td class="num">${UI.tl(k.birim_maliyet)}</td></tr>`
                )
                .join('')}
            </tbody></table>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <input class="di-belge" data-g="${gi}" placeholder="İade belge no (isteğe bağlı)" style="max-width:240px" />
              <button class="di-iade" data-g="${gi}">Seçilenleri ${g.tedarikci_id ? 'bu depoya ' : ''}iade et</button>
            </div>
          </div>`
              )
              .join('')
          : '<div class="card empty-state" style="margin-bottom:14px">Bu aralıkta miadı yaklaşan stoklu parti yok.</div>';
      };
      const gecmisCiz = async () => {
        const l = await Api.get('/api/depo-iade');
        document.getElementById('di-gecmis').innerHTML = l.length
          ? `<table><thead><tr><th>Tarih</th><th>Depo</th><th>Belge</th><th class="num">Adet</th><th class="num">Tutar</th><th></th></tr></thead><tbody>
            ${l.map((d) => `<tr><td>${UI.tarih(d.tarih)}</td><td>${UI.esc(d.firma_adi || '-')}</td><td>${UI.esc(d.belge_no || 'IADE-' + d.id)}</td><td class="num">${d.adet}</td><td class="num">${UI.tl(d.toplam)}</td><td><button class="secondary" data-form="${d.id}">Form</button></td></tr>`).join('')}</tbody></table>`
          : '<p class="form-ipucu">Henüz iade yok.</p>';
      };
      const yenile = async () => {
        veri = await Api.get('/api/depo-iade/adaylar?gun=' + document.getElementById('di-gun').value);
        ciz();
      };

      document.getElementById('di-gun').addEventListener('change', yenile);
      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('di-hepsi')) container.querySelectorAll(`.di-sec[data-g="${e.target.dataset.g}"]`).forEach((c) => (c.checked = e.target.checked));
      });
      container.addEventListener('click', async (e) => {
        const form = e.target.closest('[data-form]');
        if (form) return formAc(Number(form.dataset.form));
        const btn = e.target.closest('.di-iade');
        if (!btn) return;
        const gi = btn.dataset.g;
        const g = veri.gruplar[Number(gi)];
        const kalemler = [...container.querySelectorAll(`.di-sec[data-g="${gi}"]:checked`)].map((c) => ({
          parti_id: Number(c.dataset.parti),
          adet: Number(container.querySelector(`.di-adet[data-parti="${c.dataset.parti}"]`).value)
        }));
        if (!kalemler.length) return UI.toast('İade edilecek partileri seçin', 'error');
        if (!confirm(`${kalemler.length} parti ${g.tedarikci_adi} için iade edilecek ve stoktan düşülecek. Onaylıyor musunuz?`)) return;
        try {
          const r = await Api.post('/api/depo-iade', { tedarikci_id: g.tedarikci_id, kalemler, belge_no: container.querySelector(`.di-belge[data-g="${gi}"]`).value || null });
          UI.toast(`İade kaydedildi (${UI.tl(r.toplam)})`, 'success');
          await yenile();
          await gecmisCiz();
          formAc(r.id);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      await yenile();
      await gecmisCiz();
    }
  };
  Views.depoIade = view;
})();
