(function () {
  let liste = [];

  const KATEGORI_ETIKET = {
    kira: 'Kira',
    fatura: 'Fatura',
    maas: 'Maaş',
    vergi: 'Vergi',
    tedarik: 'Tedarik',
    diger: 'Diğer'
  };

  function formHtml(g) {
    const x = g || {};
    return `
      <h3>${g ? 'Gider Düzenle' : 'Yeni Gider'}</h3>
      <form id="gider-form">
        <div class="form-grid">
          <div>
            <label>Kategori</label>
            <select name="kategori" required>
              ${Object.entries(KATEGORI_ETIKET).map(([v, l]) => `<option value="${v}" ${x.kategori === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div><label>Tutar (TL)</label><input name="tutar" type="number" step="0.01" min="0.01" required value="${x.tutar ?? ''}" /></div>
          <div><label>Tarih</label><input name="tarih" type="date" required value="${x.tarih || new Date().toISOString().slice(0, 10)}" /></div>
        </div>
        <div><label>Açıklama</label><input name="aciklama" value="${UI.esc(x.aciklama || '')}" /></div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formuBagla(modal, gider, onKaydedildi) {
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('#gider-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const veri = {
        kategori: fd.get('kategori'),
        aciklama: fd.get('aciklama') || null,
        tutar: Number(fd.get('tutar')),
        tarih: fd.get('tarih')
      };
      try {
        if (gider) {
          await Api.put(`/api/giderler/${gider.id}`, veri);
          UI.toast('Gider güncellendi', 'success');
        } else {
          await Api.post('/api/giderler', veri);
          UI.toast('Gider eklendi', 'success');
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
          <input id="gider-baslangic" type="date" />
          <input id="gider-bitis" type="date" />
          <button id="gider-filtrele" class="secondary">Filtrele</button>
          <div class="spacer"></div>
          <button id="yeni-gider-btn">+ Yeni Gider</button>
        </div>
        <div class="stat-row" id="gider-ozet"></div>
        <div class="card">
          <table>
            <thead><tr><th>Tarih</th><th>Kategori</th><th>Açıklama</th><th class="num">Tutar</th><th></th></tr></thead>
            <tbody id="gider-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async () => {
        const baslangic = document.getElementById('gider-baslangic').value;
        const bitis = document.getElementById('gider-bitis').value;
        const params = new URLSearchParams();
        if (baslangic) params.set('baslangic', baslangic);
        if (bitis) params.set('bitis', bitis);

        liste = await Api.get('/api/giderler?' + params.toString());
        const toplam = liste.reduce((sum, g) => sum + g.tutar, 0);

        document.getElementById('gider-ozet').innerHTML = `
          <div class="stat-tile c-rose"><div class="label">Toplam Gider</div><div class="value">${UI.tl(toplam)}</div></div>
          <div class="stat-tile"><div class="label">Kayıt Sayısı</div><div class="value">${liste.length}</div></div>
        `;

        document.getElementById('gider-tbody').innerHTML = liste.length
          ? liste
              .map(
                (g) => `<tr>
                  <td>${g.tarih}</td>
                  <td><span class="badge muted">${KATEGORI_ETIKET[g.kategori] || g.kategori}</span></td>
                  <td>${UI.esc(g.aciklama || '-')}</td>
                  <td class="num">${UI.tl(g.tutar)}</td>
                  <td class="actions-col">
                    <button class="secondary" data-action="duzenle" data-id="${g.id}">Düzenle</button>
                    <button class="danger" data-action="sil" data-id="${g.id}">Sil</button>
                  </td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="5" class="empty-state">Kayıt bulunamadı</td></tr>';
      };

      document.getElementById('gider-filtrele').addEventListener('click', yenile);
      document.getElementById('yeni-gider-btn').addEventListener('click', () => {
        const modal = UI.openModal(formHtml(null));
        formuBagla(modal, null, yenile);
      });

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const g = liste.find((x) => x.id === id);

        if (btn.dataset.action === 'duzenle') {
          const modal = UI.openModal(formHtml(g));
          formuBagla(modal, g, yenile);
        } else if (btn.dataset.action === 'sil') {
          if (!(await UI.confirmSil('Bu gider kaydı silinsin mi?'))) return;
          try {
            await Api.del(`/api/giderler/${id}`);
            UI.toast('Gider silindi', 'success');
            yenile();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });

      await yenile();
    }
  };

  Views.giderler = view;
})();
