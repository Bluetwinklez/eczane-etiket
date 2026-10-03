(function () {
  let liste = [];
  let ekip = [];

  const ONCELIK_ROZETI = {
    yuksek: '<span class="badge danger">Yüksek</span>',
    orta: '<span class="badge warn">Orta</span>',
    dusuk: '<span class="badge muted">Düşük</span>'
  };

  function formHtml() {
    return `
      <h3>Yeni Görev</h3>
      <form id="gorev-form">
        <div><label>Başlık</label><input name="baslik" required placeholder="örn. SKT kontrolü yap" /></div>
        <div><label>Açıklama (opsiyonel)</label><textarea name="aciklama" rows="2"></textarea></div>
        <div class="form-grid">
          <div>
            <label>Atanan Kişi (opsiyonel)</label>
            <select name="atanan_kullanici_id">
              <option value="">- Atanmadı -</option>
              ${ekip.map((k) => `<option value="${k.id}">${UI.esc(k.ad_soyad)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Öncelik</label>
            <select name="oncelik">
              <option value="dusuk">Düşük</option>
              <option value="orta" selected>Orta</option>
              <option value="yuksek">Yüksek</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Oluştur</button>
        </div>
      </form>
    `;
  }

  function gorevKarti(g) {
    const tamamlandi = g.durum === 'tamamlandi';
    return `
      <div class="card" style="margin-bottom:10px;${tamamlandi ? 'opacity:0.6' : ''}" data-id="${g.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="flex:1">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" class="gorev-check" data-id="${g.id}" ${tamamlandi ? 'checked' : ''} style="width:auto" />
              <strong style="${tamamlandi ? 'text-decoration:line-through' : ''}">${UI.esc(g.baslik)}</strong>
            </label>
            ${g.aciklama ? `<p style="margin:6px 0 0 26px;color:var(--text-muted);font-size:13px">${UI.esc(g.aciklama)}</p>` : ''}
            <div style="margin:8px 0 0 26px;display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text-muted)">
              ${ONCELIK_ROZETI[g.oncelik] || ''}
              ${g.atanan_adi ? `<span>→ ${UI.esc(g.atanan_adi)}</span>` : '<span>Atanmadı</span>'}
            </div>
          </div>
          <button class="danger" data-action="sil" data-id="${g.id}" style="padding:5px 10px;font-size:12px">Sil</button>
        </div>
      </div>
    `;
  }

  const view = {
    async render(container) {
      [liste, ekip] = await Promise.all([Api.get('/api/gorevler'), Api.get('/api/gorevler/ekip')]);

      const bekleyenler = liste.filter((g) => g.durum === 'bekliyor');
      const tamamlananlar = liste.filter((g) => g.durum === 'tamamlandi');

      container.innerHTML = `
        <div class="toolbar">
          <div class="spacer"></div>
          <button id="yeni-gorev-btn">+ Yeni Görev</button>
        </div>
        <div class="stat-row">
          <div class="stat-tile c-amber"><div class="label">Bekleyen</div><div class="value">${bekleyenler.length}</div></div>
          <div class="stat-tile c-mint"><div class="label">Tamamlanan</div><div class="value">${tamamlananlar.length}</div></div>
        </div>
        <div id="gorev-listesi">
          ${bekleyenler.length ? bekleyenler.map(gorevKarti).join('') : '<div class="empty-state">Bekleyen görev yok</div>'}
          ${tamamlananlar.length ? `<h3 style="margin:20px 0 10px;font-size:14px;color:var(--text-muted)">Tamamlananlar</h3>${tamamlananlar.map(gorevKarti).join('')}` : ''}
        </div>
      `;

      document.getElementById('yeni-gorev-btn').addEventListener('click', () => {
        const modal = UI.openModal(formHtml());
        modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
        modal.querySelector('#gorev-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await Api.post('/api/gorevler', {
              baslik: fd.get('baslik'),
              aciklama: fd.get('aciklama') || null,
              atanan_kullanici_id: fd.get('atanan_kullanici_id') || null,
              oncelik: fd.get('oncelik')
            });
            UI.toast('Görev oluşturuldu', 'success');
            UI.closeModal(modal);
            view.render(container);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      });

      document.getElementById('gorev-listesi').addEventListener('click', async (e) => {
        const check = e.target.closest('.gorev-check');
        const silBtn = e.target.closest('[data-action="sil"]');

        if (check) {
          try {
            await Api.put(`/api/gorevler/${check.dataset.id}`, {
              durum: check.checked ? 'tamamlandi' : 'bekliyor'
            });
            view.render(container);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        } else if (silBtn) {
          if (!(await UI.confirmSil('Bu görev silinsin mi?'))) return;
          try {
            await Api.del(`/api/gorevler/${silBtn.dataset.id}`);
            UI.toast('Görev silindi', 'success');
            view.render(container);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });
    }
  };

  Views.gorevler = view;
})();
