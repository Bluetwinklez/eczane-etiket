(function () {
  let liste = [];

  function formHtml(s) {
    const x = s || {};
    return `
      <h3>${s ? 'Şube Düzenle' : 'Yeni Şube'}</h3>
      <form id="sube-form">
        <div class="form-grid">
          <div><label>Şube Adı</label><input name="ad" required value="${UI.esc(x.ad || '')}" /></div>
          <div><label>Telefon</label><input name="telefon" value="${UI.esc(x.telefon || '')}" /></div>
        </div>
        <div><label>Adres</label><textarea name="adres" rows="2">${UI.esc(x.adres || '')}</textarea></div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formuBagla(modal, sube, onKaydedildi) {
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('#sube-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const veri = { ad: fd.get('ad'), adres: fd.get('adres') || null, telefon: fd.get('telefon') || null };
      try {
        if (sube) {
          await Api.put(`/api/subeler/${sube.id}`, veri);
          UI.toast('Şube güncellendi', 'success');
        } else {
          await Api.post('/api/subeler', veri);
          UI.toast('Şube eklendi (mevcut ilaçlar için stok kaydı 0 olarak oluşturuldu)', 'success');
        }
        UI.closeModal(modal);
        onKaydedildi();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  const view = {
    async render(container) {
      liste = await Api.get('/api/subeler');

      container.innerHTML = `
        <div class="toolbar">
          <div class="spacer"></div>
          <button id="yeni-sube-btn">+ Yeni Şube</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Şube Adı</th><th>Adres</th><th>Telefon</th><th></th></tr></thead>
            <tbody>
              ${liste
                .map(
                  (s) => `<tr>
                    <td>${UI.esc(s.ad)}</td>
                    <td>${UI.esc(s.adres || '-')}</td>
                    <td>${UI.esc(s.telefon || '-')}</td>
                    <td class="actions-col">
                      <button class="secondary" data-action="duzenle" data-id="${s.id}">Düzenle</button>
                      <button class="danger" data-action="sil" data-id="${s.id}">Sil</button>
                    </td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById('yeni-sube-btn').addEventListener('click', () => {
        const modal = UI.openModal(formHtml(null));
        formuBagla(modal, null, () => view.render(container));
      });

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const s = liste.find((x) => x.id === id);

        if (btn.dataset.action === 'duzenle') {
          const modal = UI.openModal(formHtml(s));
          formuBagla(modal, s, () => view.render(container));
        } else if (btn.dataset.action === 'sil') {
          if (!(await UI.confirmSil(`"${s.ad}" şubesi silinsin mi?`))) return;
          try {
            await Api.del(`/api/subeler/${id}`);
            UI.toast('Şube silindi', 'success');
            view.render(container);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });
    }
  };

  Views.subeler = view;
})();
