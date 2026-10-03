(function () {
  const DURUM = {
    yolda: '<span class="badge warn">Yolda</span>',
    teslim_alindi: '<span class="badge ok">Teslim alındı</span>',
    iptal: '<span class="badge muted">İptal</span>'
  };

  let subeler = [];
  let ilaclar = [];
  let kalemler = [];

  function kalemleriCiz() {
    const tbody = document.getElementById('tr-kalemler');
    tbody.innerHTML = kalemler.length
      ? kalemler
          .map((k, idx) => {
            const ilac = ilaclar.find((i) => i.id === k.ilac_id);
            return `<tr><td>${UI.esc(ilac.ad)}</td><td class="num">${ilac.stok}</td>
              <td class="num"><input type="number" min="1" max="${ilac.stok}" value="${k.adet}" data-idx="${idx}" class="tr-adet" style="width:80px" /></td>
              <td><button type="button" class="secondary" data-cikar="${idx}">Sil</button></td></tr>`;
          })
          .join('')
      : '<tr><td colspan="4" class="empty-state">Ürün eklenmedi</td></tr>';
  }

  async function detayGoster(id, ctx, onDegisti) {
    const t = await Api.get(`/api/transferler/${id}`);
    const benimSubem = ctx.user.sube_id;
    const admin = ctx.user.rol === 'admin';
    const teslimAlabilir = t.durum === 'yolda' && (admin || t.hedef_sube_id === benimSubem);
    const iptalEdebilir = t.durum === 'yolda' && (admin || t.kaynak_sube_id === benimSubem);
    const modal = UI.openModal(`
      <h3 class="modal-genis">Transfer #${t.id} ${DURUM[t.durum]}</h3>
      <p class="form-ipucu">${UI.esc(t.kaynak_sube)} → ${UI.esc(t.hedef_sube)} · ${UI.tarih(t.tarih)} · Gönderen: ${UI.esc(t.gonderen || '-')}
        ${t.teslim_tarihi ? ` · ${t.durum === 'iptal' ? 'İptal' : 'Teslim'}: ${UI.tarih(t.teslim_tarihi)} (${UI.esc(t.teslim_alan || '-')})` : ''}</p>
      ${t.aciklama ? `<p>${UI.esc(t.aciklama)}</p>` : ''}
      <table><thead><tr><th>Ürün</th><th>Parti No</th><th>SKT</th><th class="num">Adet</th></tr></thead>
      <tbody>${t.kalemler.map((k) => `<tr><td>${UI.esc(k.ilac_adi)}</td><td>${UI.esc(k.parti_no || '-')}</td><td>${k.skt || '-'}</td><td class="num">${k.adet}</td></tr>`).join('')}</tbody></table>
      <div class="modal-actions">
        ${iptalEdebilir ? '<button class="danger" data-action="iptal">İptal Et (stok geri döner)</button>' : ''}
        ${teslimAlabilir ? '<button data-action="teslim">Teslim Al</button>' : ''}
        <button class="secondary" data-action="kapat">Kapat</button>
      </div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    const islem = async (yol, mesaj) => {
      try {
        await Api.post(`/api/transferler/${t.id}/${yol}`, {});
        UI.toast(mesaj, 'success');
        UI.closeModal(modal);
        onDegisti();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    };
    modal.querySelector('[data-action="teslim"]')?.addEventListener('click', () => islem('teslim-al', 'Transfer teslim alındı, stoğa eklendi'));
    modal.querySelector('[data-action="iptal"]')?.addEventListener('click', () => {
      if (window.confirm('Transfer iptal edilsin mi? Ürünler gönderen şubenin stoğuna geri döner.')) islem('iptal', 'Transfer iptal edildi');
    });
  }

  const view = {
    async render(container, ctx) {
      kalemler = [];
      let liste;
      [subeler, ilaclar, liste] = await Promise.all([
        Api.get('/api/transferler/subeler'),
        Api.get('/api/ilaclar'),
        Api.get('/api/transferler')
      ]);
      const hedefler = subeler.filter((s) => s.id !== ctx.user.sube_id);
      const gelen = liste.filter((t) => t.durum === 'yolda' && t.hedef_sube_id === ctx.user.sube_id);

      container.innerHTML = `
        ${
          gelen.length
            ? `<div class="card" style="border-left:4px solid var(--warning)"><h3>📦 Teslim bekleyen ${gelen.length} transfer var</h3>
                ${gelen.map((t) => `<button class="secondary" data-detay="${t.id}">#${t.id} · ${UI.esc(t.kaynak_sube)} · ${t.toplam_adet} adet</button>`).join(' ')}</div>`
            : ''
        }
        <div class="card">
          <h3>Yeni Transfer (bu şubeden gönder)</h3>
          ${
            hedefler.length
              ? `<div class="form-grid">
                  <div><label>Alıcı Şube</label><select id="tr-hedef">${hedefler.map((s) => `<option value="${s.id}">${UI.esc(s.ad)}</option>`).join('')}</select></div>
                  <div><label>Ürün</label><select id="tr-ilac">${ilaclar
                    .filter((i) => i.stok > 0)
                    .map((i) => `<option value="${i.id}">${UI.esc(i.ad)} (stok: ${i.stok})</option>`)
                    .join('')}</select></div>
                  <div><label>&nbsp;</label><button type="button" class="secondary" id="tr-ekle">+ Ekle</button></div>
                </div>
                <table style="margin-top:10px"><thead><tr><th>Ürün</th><th class="num">Stok</th><th class="num">Gönderilecek</th><th></th></tr></thead><tbody id="tr-kalemler"></tbody></table>
                <div><label>Açıklama</label><input id="tr-aciklama" placeholder="örn. Merkez depodan takviye" /></div>
                <button id="tr-gonder" style="margin-top:10px">Transferi Gönder</button>
                <p class="form-ipucu">Gönderilen ürünler SKT'si en yakın partilerden düşer; alıcı şubeye aynı parti no ve SKT ile girer.</p>`
              : '<p class="empty-state">Transfer için en az iki şube olmalı.</p>'
          }
        </div>
        <div class="card">
          <h3>Transferler</h3>
          <table>
            <thead><tr><th>No</th><th>Tarih</th><th>Gönderen → Alan</th><th>Ürünler</th><th class="num">Adet</th><th>Durum</th><th></th></tr></thead>
            <tbody>${
              liste.length
                ? liste
                    .map(
                      (t) => `<tr><td>#${t.id}</td><td>${UI.tarih(t.tarih)}</td><td>${UI.esc(t.kaynak_sube)} → ${UI.esc(t.hedef_sube)}</td>
                        <td>${UI.esc(t.urunler || '-')}</td><td class="num">${t.toplam_adet}</td><td>${DURUM[t.durum]}</td>
                        <td class="actions-col"><button class="secondary" data-detay="${t.id}">Detay</button></td></tr>`
                    )
                    .join('')
                : '<tr><td colspan="7" class="empty-state">Henüz transfer yok</td></tr>'
            }</tbody>
          </table>
        </div>
      `;

      const yenile = () => view.render(container, ctx);
      container.querySelectorAll('[data-detay]').forEach((b) => b.addEventListener('click', () => detayGoster(Number(b.dataset.detay), ctx, yenile)));
      if (!hedefler.length) return;

      kalemleriCiz();
      document.getElementById('tr-ekle').addEventListener('click', () => {
        const id = Number(document.getElementById('tr-ilac').value);
        if (!id) return;
        const mevcut = kalemler.find((k) => k.ilac_id === id);
        if (mevcut) mevcut.adet += 1;
        else kalemler.push({ ilac_id: id, adet: 1 });
        kalemleriCiz();
      });
      document.getElementById('tr-kalemler').addEventListener('input', (e) => {
        if (e.target.classList.contains('tr-adet')) kalemler[Number(e.target.dataset.idx)].adet = Number(e.target.value) || 0;
      });
      document.getElementById('tr-kalemler').addEventListener('click', (e) => {
        const b = e.target.closest('[data-cikar]');
        if (b) {
          kalemler.splice(Number(b.dataset.cikar), 1);
          kalemleriCiz();
        }
      });
      document.getElementById('tr-gonder').addEventListener('click', async () => {
        if (!kalemler.length) {
          UI.toast('Ürün ekleyin', 'error');
          return;
        }
        try {
          const t = await Api.post('/api/transferler', {
            hedef_sube_id: Number(document.getElementById('tr-hedef').value),
            kalemler,
            aciklama: document.getElementById('tr-aciklama').value || null
          });
          UI.toast(`Transfer #${t.id} gönderildi`, 'success');
          yenile();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    }
  };

  Views.transferler = view;
})();
