(function () {
  let mevcutListe = [];

  function yazmaYetkisiVar(ctx) {
    return ctx.user.rol === 'admin' || ctx.user.rol === 'eczaci';
  }

  function sktRozeti(skt) {
    if (!skt) return '';
    const gun = (new Date(skt) - new Date()) / (1000 * 60 * 60 * 24);
    if (gun < 0) return '<span class="badge danger">SKT geçti</span>';
    if (gun <= 30) return '<span class="badge warn">SKT yaklaşıyor</span>';
    return '';
  }

  function satirHtml(ilac, ctx) {
    const stokRozeti = ilac.stok <= ilac.kritik_stok ? '<span class="badge danger">Kritik</span>' : '<span class="badge ok">Normal</span>';
    const aksiyonlar = yazmaYetkisiVar(ctx)
      ? `
        <button class="secondary" data-action="duzenle" data-id="${ilac.id}">Düzenle</button>
        <button class="secondary" data-action="fiyat-gecmisi" data-id="${ilac.id}">Fiyat Geçmişi</button>
        ${ctx.user.rol === 'admin' ? `<button class="danger" data-action="sil" data-id="${ilac.id}">Sil</button>` : ''}
      `
      : `<button class="secondary" data-action="fiyat-gecmisi" data-id="${ilac.id}">Fiyat Geçmişi</button>`;

    return `
      <tr>
        <td>${UI.esc(ilac.ad)} ${ilac.receteli ? '<span class="badge muted">Reçeteli</span>' : ''} ${sktRozeti(ilac.skt)}</td>
        <td>${UI.esc(ilac.barkod || '-')}</td>
        <td>${UI.esc(ilac.kategori || '-')}</td>
        <td class="num">${ilac.stok} ${stokRozeti}</td>
        <td class="num">${UI.tl(ilac.satis_fiyati)}</td>
        <td>${ilac.skt || '-'}</td>
        <td class="actions-col">${aksiyonlar}</td>
      </tr>
    `;
  }

  function formHtml(ilac) {
    const i = ilac || {};
    return `
      <h3>${ilac ? 'İlaç Düzenle' : 'Yeni İlaç Ekle'}</h3>
      <form id="ilac-form">
        <div class="form-grid">
          <div><label>Ad</label><input name="ad" required value="${UI.esc(i.ad || '')}" /></div>
          <div><label>Barkod</label><input name="barkod" value="${UI.esc(i.barkod || '')}" /></div>
          <div><label>Kategori</label><input name="kategori" value="${UI.esc(i.kategori || '')}" /></div>
          <div><label>Üretici</label><input name="uretici" value="${UI.esc(i.uretici || '')}" /></div>
          <div><label>Alış Fiyatı</label><input name="alis_fiyati" type="number" step="0.01" min="0" value="${i.alis_fiyati ?? ''}" /></div>
          <div><label>Satış Fiyatı</label><input name="satis_fiyati" type="number" step="0.01" min="0" required value="${i.satis_fiyati ?? ''}" /></div>
          <div><label>Kritik Stok Sınırı</label><input name="kritik_stok" type="number" min="0" value="${i.kritik_stok ?? 10}" /></div>
          <div><label>Son Kullanma Tarihi</label><input name="skt" type="date" value="${i.skt || ''}" /></div>
          ${!ilac ? '<div><label>Başlangıç Stoku</label><input name="stok" type="number" min="0" value="0" /></div>' : ''}
        </div>
        <div><label><input type="checkbox" name="receteli" style="width:auto" ${i.receteli ? 'checked' : ''} /> Reçeteli ilaç</label></div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formVerisiTopla(form) {
    const fd = new FormData(form);
    return {
      ad: fd.get('ad'),
      barkod: fd.get('barkod') || null,
      kategori: fd.get('kategori') || null,
      uretici: fd.get('uretici') || null,
      alis_fiyati: Number(fd.get('alis_fiyati')) || 0,
      satis_fiyati: Number(fd.get('satis_fiyati')) || 0,
      kritik_stok: Number(fd.get('kritik_stok')) || 10,
      skt: fd.get('skt') || null,
      stok: fd.has('stok') ? Number(fd.get('stok')) || 0 : undefined,
      receteli: form.querySelector('[name="receteli"]').checked
    };
  }

  function formuBagla(modal, ilac, onKaydedildi) {
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelector('#ilac-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const veri = formVerisiTopla(e.target);
      try {
        if (ilac) {
          await Api.put(`/api/ilaclar/${ilac.id}`, veri);
          UI.toast('İlaç güncellendi', 'success');
        } else {
          await Api.post('/api/ilaclar', veri);
          UI.toast('İlaç eklendi', 'success');
        }
        UI.closeModal(modal);
        onKaydedildi();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  async function fiyatGecmisiGoster(id) {
    const gecmis = await Api.get(`/api/ilaclar/${id}/fiyat-gecmisi`);
    const satirlar = gecmis.length
      ? gecmis.map((g) => `<tr><td>${UI.tarih(g.tarih)}</td><td class="num">${UI.tl(g.eski_fiyat)}</td><td class="num">${UI.tl(g.yeni_fiyat)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty-state">Fiyat değişikliği kaydı yok</td></tr>';

    const modal = UI.openModal(`
      <h3>Fiyat Geçmişi</h3>
      <table><thead><tr><th>Tarih</th><th class="num">Eski Fiyat</th><th class="num">Yeni Fiyat</th></tr></thead>
      <tbody>${satirlar}</tbody></table>
      <div class="modal-actions"><button class="secondary" data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
  }

  const view = {
    async render(container, ctx) {
      container.innerHTML = `
        <div class="toolbar">
          <input id="ilac-ara" placeholder="İlaç, barkod veya kategori ara..." style="max-width:320px" />
          <div class="spacer"></div>
          ${yazmaYetkisiVar(ctx) ? '<button id="yeni-ilac-btn">+ Yeni İlaç</button>' : ''}
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Ad</th><th>Barkod</th><th>Kategori</th><th class="num">Stok</th><th class="num">Satış Fiyatı</th><th>SKT</th><th></th></tr></thead>
            <tbody id="ilac-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async (q) => {
        mevcutListe = await Api.get('/api/ilaclar' + (q ? '?q=' + encodeURIComponent(q) : ''));
        const tbody = document.getElementById('ilac-tbody');
        tbody.innerHTML = mevcutListe.length
          ? mevcutListe.map((i) => satirHtml(i, ctx)).join('')
          : '<tr><td colspan="7" class="empty-state">Kayıt bulunamadı</td></tr>';
      };

      let aramaTimer;
      document.getElementById('ilac-ara').addEventListener('input', (e) => {
        clearTimeout(aramaTimer);
        aramaTimer = setTimeout(() => yenile(e.target.value), 250);
      });

      if (yazmaYetkisiVar(ctx)) {
        document.getElementById('yeni-ilac-btn').addEventListener('click', () => {
          const modal = UI.openModal(formHtml(null));
          formuBagla(modal, null, () => yenile(document.getElementById('ilac-ara').value));
        });
      }

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const ilac = mevcutListe.find((i) => i.id === id);

        if (btn.dataset.action === 'duzenle') {
          const modal = UI.openModal(formHtml(ilac));
          formuBagla(modal, ilac, () => yenile(document.getElementById('ilac-ara').value));
        } else if (btn.dataset.action === 'fiyat-gecmisi') {
          fiyatGecmisiGoster(id);
        } else if (btn.dataset.action === 'sil') {
          if (!(await UI.confirmSil(`"${ilac.ad}" silinsin mi?`))) return;
          try {
            await Api.del(`/api/ilaclar/${id}`);
            UI.toast('İlaç silindi', 'success');
            yenile(document.getElementById('ilac-ara').value);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });

      await yenile();
    }
  };

  Views.ilaclar = view;
})();
