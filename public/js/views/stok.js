(function () {
  function yazmaYetkisiVar(ctx) {
    return ctx.user.rol === 'admin' || ctx.user.rol === 'eczaci';
  }

  function uyariTablosu(baslik, rows, sktGoster) {
    if (!rows.length) {
      return `<div class="card"><h3>${baslik}</h3><div class="empty-state">Uyarı bulunmuyor</div></div>`;
    }
    const satirlar = rows
      .map(
        (r) => `<tr>
          <td>${UI.esc(r.ad)}</td>
          <td class="num">${r.stok}</td>
          <td class="num">${r.kritik_stok}</td>
          <td>${r.skt ? r.skt + (r.durum === 'sona_ermis' ? ' <span class="badge danger">Sona erdi</span>' : ' <span class="badge warn">Yaklaşıyor</span>') : '-'}</td>
        </tr>`
      )
      .join('');
    return `
      <div class="card">
        <h3>${baslik} (${rows.length})</h3>
        <table>
          <thead><tr><th>İlaç</th><th class="num">Stok</th><th class="num">Kritik Sınır</th><th>SKT</th></tr></thead>
          <tbody>${satirlar}</tbody>
        </table>
      </div>
    `;
  }

  const view = {
    async render(container, ctx) {
      const [uyarilar, ilaclar] = await Promise.all([
        Api.get('/api/ilaclar/uyarilar'),
        Api.get('/api/ilaclar')
      ]);

      const formHtml = yazmaYetkisiVar(ctx)
        ? `
        <div class="card">
          <h3>Stok Hareketi Ekle</h3>
          <form id="stok-form">
            <div class="form-grid">
              <div>
                <label>İlaç</label>
                <select name="ilac_id" required>
                  ${ilaclar.map((i) => `<option value="${i.id}">${UI.esc(i.ad)} (mevcut: ${i.stok})</option>`).join('')}
                </select>
              </div>
              <div>
                <label>Hareket Tipi</label>
                <select name="tip">
                  <option value="giris">Giriş (stok ekle)</option>
                  <option value="cikis">Çıkış (stok düş)</option>
                </select>
              </div>
              <div><label>Adet</label><input name="adet" type="number" min="1" required /></div>
              <div><label>Açıklama</label><input name="aciklama" placeholder="örn. Tedarikçi sevkiyatı" /></div>
            </div>
            <button type="submit">Kaydet</button>
          </form>
        </div>
      `
        : '';

      container.innerHTML = `
        ${formHtml}
        ${uyariTablosu('Kritik Stok Uyarıları', uyarilar.kritik_stok)}
        ${uyariTablosu('Son Kullanma Tarihi Uyarıları', uyarilar.skt_yaklasan)}
      `;

      if (yazmaYetkisiVar(ctx)) {
        document.getElementById('stok-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await Api.post(`/api/ilaclar/${fd.get('ilac_id')}/stok`, {
              tip: fd.get('tip'),
              adet: Number(fd.get('adet')),
              aciklama: fd.get('aciklama') || null
            });
            UI.toast('Stok hareketi kaydedildi', 'success');
            view.render(container, ctx);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      }
    }
  };

  Views.stok = view;
})();
