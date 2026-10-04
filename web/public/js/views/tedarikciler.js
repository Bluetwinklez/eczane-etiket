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
          <div><label>Ödeme Vadesi (gün)</label><input name="vade_gun" type="number" min="0" max="365" value="${x.vade_gun ?? 30}" title="Mal kabul faturalarının vadesi bu süreyle hesaplanır" /></div>
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
        email: fd.get('email') || null,
        vade_gun: Number(fd.get('vade_gun')) || 0
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

  const ODEME_SEKLI = { havale: 'Havale/EFT', nakit: 'Nakit', kredi_karti: 'Kredi kartı', cek: 'Çek', senet: 'Senet' };

  // Tedarikci cari hesabi: bakiye, acik faturalar, hareketler, fatura/odeme girisi
  async function cariAc(tedarikci, onDegisti) {
    const ciz = async (modal) => {
      const c = await Api.get(`/api/tedarikciler/${tedarikci.id}/cari`);
      const bugun = new Date().toISOString().slice(0, 10);
      modal.querySelector('#cari-icerik').innerHTML = `
        <div class="stat-row">
          <div class="stat-tile ${c.bakiye > 0 ? 'c-rose' : 'c-mint'}"><div class="label">Bakiye (borcumuz)</div><div class="value">${UI.tl(c.bakiye)}</div></div>
          <div class="stat-tile"><div class="label">Açık Fatura</div><div class="value">${c.acik_faturalar.length}</div></div>
          <div class="stat-tile"><div class="label">Vade</div><div class="value">${c.tedarikci.vade_gun} gün</div></div>
        </div>
        <form id="cari-form" class="form-grid">
          <div><label>İşlem</label><select name="tip"><option value="odeme">Ödeme yaptık</option><option value="fatura">Fatura geldi</option></select></div>
          <div><label>Tutar (TL)</label><input name="tutar" type="number" step="0.01" min="0.01" required /></div>
          <div><label>Belge No</label><input name="belge_no" /></div>
          <div><label>Tarih</label><input name="belge_tarihi" type="date" value="${bugun}" /></div>
          <div><label>Ödeme Şekli</label><select name="odeme_sekli">${Object.entries(ODEME_SEKLI).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div style="align-self:end"><button type="submit">Kaydet</button></div>
        </form>
        <h3 style="margin-top:14px">Açık Faturalar</h3>
        <table><thead><tr><th>Belge</th><th>Tarih</th><th>Vade</th><th class="num">Tutar</th><th class="num">Kalan</th></tr></thead><tbody>
          ${
            c.acik_faturalar.length
              ? c.acik_faturalar
                  .map(
                    (f) => `<tr><td>${UI.esc(f.belge_no || f.aciklama || '-')}</td><td>${f.belge_tarihi || '-'}</td>
                      <td>${f.vade_tarihi || '-'} ${f.vade_tarihi && f.vade_tarihi < bugun ? '<span class="badge danger">Gecikti</span>' : ''}</td>
                      <td class="num">${UI.tl(f.tutar)}</td><td class="num">${UI.tl(f.kalan)}</td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="5" class="empty-state">Açık fatura yok</td></tr>'
          }</tbody></table>
        <h3 style="margin-top:14px">Hareketler</h3>
        <table><thead><tr><th>Tarih</th><th>İşlem</th><th>Belge</th><th class="num">Tutar</th><th>Kaydeden</th></tr></thead><tbody>
          ${
            c.hareketler.length
              ? c.hareketler
                  .map(
                    (h) => `<tr><td>${h.belge_tarihi || UI.tarih(h.tarih)}</td>
                      <td>${h.tip === 'fatura' ? '<span class="badge warn">Fatura</span>' : `<span class="badge ok">Ödeme · ${ODEME_SEKLI[h.odeme_sekli] || ''}</span>`}</td>
                      <td>${UI.esc(h.belge_no || h.aciklama || '-')}</td><td class="num">${UI.tl(h.tutar)}</td><td>${UI.esc(h.kullanici_adi || '-')}</td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="5" class="empty-state">Hareket yok</td></tr>'
          }</tbody></table>`;
      const form = modal.querySelector('#cari-form');
      form.tip.addEventListener('change', () => {
        form.odeme_sekli.disabled = form.tip.value !== 'odeme';
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await Api.post(`/api/tedarikciler/${tedarikci.id}/hareketler`, {
            tip: form.tip.value,
            tutar: Number(form.tutar.value),
            belge_no: form.belge_no.value || null,
            belge_tarihi: form.belge_tarihi.value || null,
            odeme_sekli: form.tip.value === 'odeme' ? form.odeme_sekli.value : null
          });
          UI.toast(form.tip.value === 'odeme' ? 'Ödeme kaydedildi' : 'Fatura kaydedildi', 'success');
          await ciz(modal);
          onDegisti();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    };
    const modal = UI.openModal(`
      <div class="modal-genis"><h3>${UI.esc(tedarikci.firma_adi)} — Cari Hesap</h3><div id="cari-icerik"><div class="empty-state">Yükleniyor...</div></div></div>
      <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    try {
      await ciz(modal);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  const view = {
    async render(container, { user }) {
      const yonetici = user.rol === 'admin' || user.rol === 'eczaci';
      container.innerHTML = `
        ${yonetici ? '<div class="card" id="vade-kart"></div>' : ''}
        <div class="toolbar">
          <input id="tedarikci-ara" placeholder="Tedarikçi ara..." style="max-width:320px" />
          <div class="spacer"></div>
          ${yonetici ? '<button id="yeni-tedarikci-btn">+ Yeni Tedarikçi</button>' : ''}
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
                  <td class="actions-col">${
                    yonetici
                      ? `<button class="secondary" data-action="cari" data-id="${t.id}">Cari Hesap</button>
                    <button class="secondary" data-action="duzenle" data-id="${t.id}">Düzenle</button>
                    <button class="danger" data-action="sil" data-id="${t.id}">Sil</button>`
                      : ''
                  }</td>
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

      const vadeleriYukle = async () => {
        if (!yonetici) return;
        const v = await Api.get('/api/tedarikciler/vadeler/liste?gun=30');
        document.getElementById('vade-kart').innerHTML = `
          <div class="kart-bas"><h3>30 Gün İçindeki Ödemeler</h3><span class="badge ${v.liste.some((f) => f.gecikmis) ? 'danger' : 'muted'}">Toplam ${UI.tl(v.toplam)}</span></div>
          ${
            v.liste.length
              ? `<table><thead><tr><th>Vade</th><th>Tedarikçi</th><th>Belge</th><th class="num">Kalan</th></tr></thead><tbody>
                  ${v.liste
                    .map(
                      (f) => `<tr><td>${f.vade} ${f.gecikmis ? '<span class="badge danger">Gecikti</span>' : ''}</td><td>${UI.esc(f.firma_adi)}</td>
                        <td>${UI.esc(f.belge_no || f.aciklama || '-')}</td><td class="num">${UI.tl(f.kalan)}</td></tr>`
                    )
                    .join('')}</tbody></table>`
              : '<p class="form-ipucu" style="margin:0">Yaklaşan veya gecikmiş tedarikçi ödemesi yok.</p>'
          }`;
      };

      if (yonetici) {
        document.getElementById('yeni-tedarikci-btn').addEventListener('click', () => {
          const modal = UI.openModal(formHtml(null));
          formuBagla(modal, null, () => yenile(document.getElementById('tedarikci-ara').value));
        });
      }

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const t = liste.find((x) => x.id === id);

        if (btn.dataset.action === 'cari') {
          cariAc(t, vadeleriYukle);
        } else if (btn.dataset.action === 'duzenle') {
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

      await Promise.all([yenile(), vadeleriYukle()]);
    }
  };

  Views.tedarikciler = view;
})();
