(function () {
  let liste = [];

  function formHtml(m) {
    const x = m || {};
    return `
      <h3>${m ? 'Müşteri Düzenle' : 'Yeni Müşteri'}</h3>
      <form id="musteri-form">
        <div class="form-grid">
          <div><label>Ad Soyad</label><input name="ad_soyad" required value="${UI.esc(x.ad_soyad || '')}" /></div>
          <div><label>Telefon</label><input name="telefon" value="${UI.esc(x.telefon || '')}" /></div>
          <div><label>E-posta</label><input name="email" type="email" value="${UI.esc(x.email || '')}" /></div>
          <div><label>TC No</label><input name="tc_no" value="${UI.esc(x.tc_no || '')}" /></div>
        </div>
        <div><label>Adres</label><textarea name="adres" rows="2">${UI.esc(x.adres || '')}</textarea></div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formuBagla(modal, musteri, onKaydedildi) {
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('#musteri-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const veri = {
        ad_soyad: fd.get('ad_soyad'),
        telefon: fd.get('telefon') || null,
        email: fd.get('email') || null,
        tc_no: fd.get('tc_no') || null,
        adres: fd.get('adres') || null
      };
      try {
        if (musteri) {
          await Api.put(`/api/musteriler/${musteri.id}`, veri);
          UI.toast('Müşteri güncellendi', 'success');
        } else {
          await Api.post('/api/musteriler', veri);
          UI.toast('Müşteri eklendi', 'success');
        }
        UI.closeModal(modal);
        onKaydedildi();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  async function satisGecmisiGoster(m) {
    const satislar = await Api.get(`/api/musteriler/${m.id}/satislar`);
    const satirlar = satislar.length
      ? satislar.map((s) => `<tr><td>${UI.tarih(s.tarih)}</td><td>${s.odeme_tipi}</td><td class="num">${UI.tl(s.toplam_tutar)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty-state">Satış kaydı yok</td></tr>';

    const modal = UI.openModal(`
      <h3>${UI.esc(m.ad_soyad)} - Satış Geçmişi</h3>
      <table><thead><tr><th>Tarih</th><th>Ödeme</th><th class="num">Tutar</th></tr></thead>
      <tbody>${satirlar}</tbody></table>
      <div class="modal-actions"><button data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
  }

  const view = {
    async render(container) {
      container.innerHTML = `
        <div class="toolbar">
          <input id="musteri-ara" placeholder="Müşteri ara..." style="max-width:320px" />
          <div class="spacer"></div>
          <button id="yeni-musteri-btn">+ Yeni Müşteri</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Ad Soyad</th><th>Telefon</th><th>E-posta</th><th></th></tr></thead>
            <tbody id="musteri-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async (q) => {
        liste = await Api.get('/api/musteriler' + (q ? '?q=' + encodeURIComponent(q) : ''));
        const tbody = document.getElementById('musteri-tbody');
        tbody.innerHTML = liste.length
          ? liste
              .map(
                (m) => `<tr>
                  <td>${UI.esc(m.ad_soyad)}</td>
                  <td>${UI.esc(m.telefon || '-')}</td>
                  <td>${UI.esc(m.email || '-')}</td>
                  <td class="actions-col">
                    <button class="secondary" data-action="gecmis" data-id="${m.id}">Satış Geçmişi</button>
                    <button class="secondary" data-action="duzenle" data-id="${m.id}">Düzenle</button>
                    <button class="danger" data-action="sil" data-id="${m.id}">Sil</button>
                  </td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="4" class="empty-state">Kayıt bulunamadı</td></tr>';
      };

      let timer;
      document.getElementById('musteri-ara').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => yenile(e.target.value), 250);
      });

      document.getElementById('yeni-musteri-btn').addEventListener('click', () => {
        const modal = UI.openModal(formHtml(null));
        formuBagla(modal, null, () => yenile(document.getElementById('musteri-ara').value));
      });

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const m = liste.find((x) => x.id === id);

        if (btn.dataset.action === 'duzenle') {
          const modal = UI.openModal(formHtml(m));
          formuBagla(modal, m, () => yenile(document.getElementById('musteri-ara').value));
        } else if (btn.dataset.action === 'gecmis') {
          satisGecmisiGoster(m);
        } else if (btn.dataset.action === 'sil') {
          if (!(await UI.confirmSil(`"${m.ad_soyad}" silinsin mi?`))) return;
          try {
            await Api.del(`/api/musteriler/${id}`);
            UI.toast('Müşteri silindi', 'success');
            yenile(document.getElementById('musteri-ara').value);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });

      await yenile();
    }
  };

  Views.musteriler = view;
})();
