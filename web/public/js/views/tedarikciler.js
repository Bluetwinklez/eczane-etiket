(function () {
  let liste = [];

  function formHtml(t) {
    const x = t || {};
    return `
      <h3>${t ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}</h3>
      <form id="tedarikci-form">
        <div class="form-grid">
          <div><label>Firma Adı</label><input name="firma_adi" required value="${UI.esc(x.firma_adi || '')}" /></div>
          <div><label>Yetkili</label><input name="yetkili" value="${UI.esc(x.yetkili || '')}" /></div>
          <div><label>Telefon</label><input name="telefon" value="${UI.esc(x.telefon || '')}" /></div>
          <div><label>E-posta</label><input name="email" type="email" value="${UI.esc(x.email || '')}" /></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formuBagla(modal, tedarikci, onKaydedildi) {
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('#tedarikci-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const veri = {
        firma_adi: fd.get('firma_adi'),
        yetkili: fd.get('yetkili') || null,
        telefon: fd.get('telefon') || null,
        email: fd.get('email') || null
      };
      try {
        if (tedarikci) {
          await Api.put(`/api/tedarikciler/${tedarikci.id}`, veri);
          UI.toast('Tedarikçi güncellendi', 'success');
        } else {
          await Api.post('/api/tedarikciler', veri);
          UI.toast('Tedarikçi eklendi', 'success');
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
      container.innerHTML = `
        <div class="toolbar">
          <input id="tedarikci-ara" placeholder="Tedarikçi ara..." style="max-width:320px" />
          <div class="spacer"></div>
          <button id="yeni-tedarikci-btn">+ Yeni Tedarikçi</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Firma Adı</th><th>Yetkili</th><th>Telefon</th><th>E-posta</th><th></th></tr></thead>
            <tbody id="tedarikci-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async (q) => {
        liste = await Api.get('/api/tedarikciler' + (q ? '?q=' + encodeURIComponent(q) : ''));
        const tbody = document.getElementById('tedarikci-tbody');
        tbody.innerHTML = liste.length
          ? liste
              .map(
                (t) => `<tr>
                  <td>${UI.esc(t.firma_adi)}</td>
                  <td>${UI.esc(t.yetkili || '-')}</td>
                  <td>${UI.esc(t.telefon || '-')}</td>
                  <td>${UI.esc(t.email || '-')}</td>
                  <td class="actions-col">
                    <button class="secondary" data-action="duzenle" data-id="${t.id}">Düzenle</button>
                    <button class="danger" data-action="sil" data-id="${t.id}">Sil</button>
                  </td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="5" class="empty-state">Kayıt bulunamadı</td></tr>';
      };

      let timer;
      document.getElementById('tedarikci-ara').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => yenile(e.target.value), 250);
      });

      document.getElementById('yeni-tedarikci-btn').addEventListener('click', () => {
        const modal = UI.openModal(formHtml(null));
        formuBagla(modal, null, () => yenile(document.getElementById('tedarikci-ara').value));
      });

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const t = liste.find((x) => x.id === id);

        if (btn.dataset.action === 'duzenle') {
          const modal = UI.openModal(formHtml(t));
          formuBagla(modal, t, () => yenile(document.getElementById('tedarikci-ara').value));
        } else if (btn.dataset.action === 'sil') {
          if (!(await UI.confirmSil(`"${t.firma_adi}" silinsin mi?`))) return;
          try {
            await Api.del(`/api/tedarikciler/${id}`);
            UI.toast('Tedarikçi silindi', 'success');
            yenile(document.getElementById('tedarikci-ara').value);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });

      await yenile();
    }
  };

  Views.tedarikciler = view;
})();
