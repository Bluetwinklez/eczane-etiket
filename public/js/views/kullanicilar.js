(function () {
  let liste = [];
  let subeler = [];

  function subeAdi(id) {
    const s = subeler.find((x) => x.id === id);
    return s ? s.ad : '-';
  }

  function formHtml(k) {
    const x = k || {};
    return `
      <h3>${k ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}</h3>
      <form id="kullanici-form">
        <div class="form-grid">
          ${k ? '' : '<div><label>Kullanıcı Adı</label><input name="kullanici_adi" required /></div>'}
          <div><label>Ad Soyad</label><input name="ad_soyad" required value="${UI.esc(x.ad_soyad || '')}" /></div>
          <div>
            <label>Rol</label>
            <select name="rol" required>
              <option value="admin" ${x.rol === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="eczaci" ${x.rol === 'eczaci' ? 'selected' : ''}>Eczacı</option>
              <option value="kasiyer" ${x.rol === 'kasiyer' ? 'selected' : ''}>Kasiyer</option>
            </select>
          </div>
          <div>
            <label>Şube</label>
            <select name="sube_id">
              ${subeler.map((s) => `<option value="${s.id}" ${x.sube_id === s.id ? 'selected' : ''}>${UI.esc(s.ad)}</option>`).join('')}
            </select>
          </div>
          <div><label>${k ? 'Yeni Şifre (opsiyonel)' : 'Şifre'}</label><input name="sifre" type="password" ${k ? '' : 'required'} minlength="6" /></div>
        </div>
        ${k ? `<label><input type="checkbox" name="aktif" style="width:auto" ${x.aktif ? 'checked' : ''} /> Aktif</label>` : ''}
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formuBagla(modal, kullanici, onKaydedildi) {
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('#kullanici-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        if (kullanici) {
          await Api.put(`/api/kullanicilar/${kullanici.id}`, {
            ad_soyad: fd.get('ad_soyad'),
            rol: fd.get('rol'),
            sube_id: fd.get('sube_id') || null,
            aktif: e.target.querySelector('[name="aktif"]').checked,
            sifre: fd.get('sifre') || undefined
          });
          UI.toast('Kullanıcı güncellendi', 'success');
        } else {
          await Api.post('/api/kullanicilar', {
            kullanici_adi: fd.get('kullanici_adi'),
            sifre: fd.get('sifre'),
            ad_soyad: fd.get('ad_soyad'),
            rol: fd.get('rol'),
            sube_id: fd.get('sube_id') || null
          });
          UI.toast('Kullanıcı eklendi', 'success');
        }
        UI.closeModal(modal);
        onKaydedildi();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  const view = {
    async render(container, ctx) {
      [liste, subeler] = await Promise.all([Api.get('/api/kullanicilar'), Api.get('/api/subeler')]);

      container.innerHTML = `
        <div class="toolbar">
          <div class="spacer"></div>
          <button id="yeni-kullanici-btn">+ Yeni Kullanıcı</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Kullanıcı Adı</th><th>Ad Soyad</th><th>Rol</th><th>Şube</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              ${liste
                .map(
                  (k) => `<tr>
                    <td>${UI.esc(k.kullanici_adi)}</td>
                    <td>${UI.esc(k.ad_soyad)}</td>
                    <td>${k.rol}</td>
                    <td>${UI.esc(subeAdi(k.sube_id))}</td>
                    <td>${k.aktif ? '<span class="badge ok">Aktif</span>' : '<span class="badge muted">Pasif</span>'}</td>
                    <td class="actions-col">
                      <button class="secondary" data-action="duzenle" data-id="${k.id}">Düzenle</button>
                      ${k.id !== ctx.user.id ? `<button class="danger" data-action="sil" data-id="${k.id}">Sil</button>` : ''}
                    </td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById('yeni-kullanici-btn').addEventListener('click', () => {
        const modal = UI.openModal(formHtml(null));
        formuBagla(modal, null, () => view.render(container, ctx));
      });

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const k = liste.find((x) => x.id === id);

        if (btn.dataset.action === 'duzenle') {
          const modal = UI.openModal(formHtml(k));
          formuBagla(modal, k, () => view.render(container, ctx));
        } else if (btn.dataset.action === 'sil') {
          if (!(await UI.confirmSil(`"${k.ad_soyad}" kullanıcısı silinsin mi?`))) return;
          try {
            await Api.del(`/api/kullanicilar/${id}`);
            UI.toast('Kullanıcı silindi', 'success');
            view.render(container, ctx);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });
    }
  };

  Views.kullanicilar = view;
})();
