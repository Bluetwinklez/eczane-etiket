(function () {
  let liste = [];
  let ilaclar = [];

  const DURUM_ROZETI = {
    aktif: '<span class="badge ok">Aktif</span>',
    planlandi: '<span class="badge warn">Planlandı</span>',
    sona_erdi: '<span class="badge muted">Sona erdi</span>',
    pasif: '<span class="badge muted">Pasif</span>'
  };

  function yazmaYetkisiVar(ctx) {
    return ctx.user.rol === 'admin' || ctx.user.rol === 'eczaci';
  }

  function kuralMetni(k) {
    return k.tip === 'yuzde' ? `%${k.indirim_yuzdesi} indirim` : `${k.al_adet} al ${k.ode_adet} öde`;
  }

  function tarihAraligi(k) {
    if (!k.baslangic && !k.bitis) return 'Süresiz';
    return `${k.baslangic || '…'} → ${k.bitis || '…'}`;
  }

  function hedefDegerAlani(hedefTip, deger) {
    if (hedefTip === 'tumu') return '<p class="form-ipucu">Tüm reçetesiz ürünlere uygulanır.</p>';
    if (hedefTip === 'urun') {
      return `<label>Ürün</label><select name="hedef_deger" required>
        ${ilaclar
          .filter((i) => !i.receteli)
          .map((i) => `<option value="${i.id}" ${String(deger) === String(i.id) ? 'selected' : ''}>${UI.esc(i.ad)}</option>`)
          .join('')}
      </select>`;
    }
    if (hedefTip === 'urun_tipi') {
      return `<label>Ürün Tipi</label><select name="hedef_deger">
        ${Object.entries(UI.URUN_TIPLERI)
          .map(([v, l]) => `<option value="${v}" ${deger === v ? 'selected' : ''}>${l}</option>`)
          .join('')}
      </select>`;
    }
    const kategoriler = [...new Set(ilaclar.map((i) => i.kategori).filter(Boolean))].sort();
    return `<label>Kategori</label><input name="hedef_deger" list="kampanya-kategoriler" required value="${UI.esc(deger || '')}" />
      <datalist id="kampanya-kategoriler">${kategoriler.map((k) => `<option value="${UI.esc(k)}">`).join('')}</datalist>`;
  }

  function formHtml(k) {
    const x = k || { tip: 'yuzde', hedef_tip: 'urun_tipi', hedef_deger: 'dermokozmetik', aktif: 1 };
    return `
      <h3>${k ? 'Kampanya Düzenle' : 'Yeni Kampanya'}</h3>
      <form id="kampanya-form">
        <div><label>Kampanya Adı</label><input name="ad" required value="${UI.esc(x.ad || '')}" placeholder="örn. Dermokozmetik %15" /></div>
        <div class="form-grid">
          <div>
            <label>Kampanya Tipi</label>
            <select name="tip">
              <option value="yuzde" ${x.tip === 'yuzde' ? 'selected' : ''}>Yüzde indirim</option>
              <option value="x_al_y_ode" ${x.tip === 'x_al_y_ode' ? 'selected' : ''}>X al Y öde</option>
            </select>
          </div>
          <div class="tip-yuzde"><label>İndirim (%)</label><input name="indirim_yuzdesi" type="number" min="1" max="90" step="0.5" value="${x.indirim_yuzdesi ?? 10}" /></div>
          <div class="tip-xy"><label>Al (adet)</label><input name="al_adet" type="number" min="2" max="20" value="${x.al_adet ?? 3}" /></div>
          <div class="tip-xy"><label>Öde (adet)</label><input name="ode_adet" type="number" min="1" max="19" value="${x.ode_adet ?? 2}" /></div>
          <div>
            <label>Hedef</label>
            <select name="hedef_tip">
              <option value="urun_tipi" ${x.hedef_tip === 'urun_tipi' ? 'selected' : ''}>Ürün tipi</option>
              <option value="kategori" ${x.hedef_tip === 'kategori' ? 'selected' : ''}>Kategori</option>
              <option value="urun" ${x.hedef_tip === 'urun' ? 'selected' : ''}>Tek ürün</option>
              <option value="tumu" ${x.hedef_tip === 'tumu' ? 'selected' : ''}>Tüm reçetesiz ürünler</option>
            </select>
          </div>
          <div id="hedef-deger-alani">${hedefDegerAlani(x.hedef_tip, x.hedef_deger)}</div>
          <div><label>Başlangıç</label><input name="baslangic" type="date" value="${x.baslangic || ''}" /></div>
          <div><label>Bitiş</label><input name="bitis" type="date" value="${x.bitis || ''}" /></div>
        </div>
        <div><label><input type="checkbox" name="aktif" style="width:auto" ${x.aktif ? 'checked' : ''} /> Aktif</label></div>
        <p class="form-ipucu">Reçeteli ilaçlara kampanya uygulanmaz. Bir üründe birden fazla kampanya geçerliyse en yüksek indirim seçilir.</p>
        <div class="modal-actions">
          <button type="button" class="secondary" data-action="kapat">Vazgeç</button>
          <button type="submit">Kaydet</button>
        </div>
      </form>
    `;
  }

  function formuBagla(modal, kampanya, onKaydedildi) {
    const form = modal.querySelector('#kampanya-form');
    const tipAlanlariniGuncelle = () => {
      const yuzde = form.tip.value === 'yuzde';
      form.querySelectorAll('.tip-yuzde').forEach((el) => (el.hidden = !yuzde));
      form.querySelectorAll('.tip-xy').forEach((el) => (el.hidden = yuzde));
    };
    form.tip.addEventListener('change', tipAlanlariniGuncelle);
    tipAlanlariniGuncelle();
    form.hedef_tip.addEventListener('change', () => {
      modal.querySelector('#hedef-deger-alani').innerHTML = hedefDegerAlani(form.hedef_tip.value, '');
    });

    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const veri = {
        ad: fd.get('ad'),
        tip: fd.get('tip'),
        hedef_tip: fd.get('hedef_tip'),
        hedef_deger: fd.get('hedef_deger'),
        indirim_yuzdesi: Number(fd.get('indirim_yuzdesi')),
        al_adet: Number(fd.get('al_adet')),
        ode_adet: Number(fd.get('ode_adet')),
        baslangic: fd.get('baslangic') || null,
        bitis: fd.get('bitis') || null,
        aktif: form.aktif.checked
      };
      try {
        if (kampanya) {
          await Api.put(`/api/kampanyalar/${kampanya.id}`, veri);
          UI.toast('Kampanya güncellendi', 'success');
        } else {
          await Api.post('/api/kampanyalar', veri);
          UI.toast('Kampanya oluşturuldu', 'success');
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
      const yazabilir = yazmaYetkisiVar(ctx);
      container.innerHTML = `
        <div class="toolbar">
          <p class="form-ipucu" style="margin:0">Aktif kampanyalar POS ekranında sepete otomatik uygulanır.</p>
          <div class="spacer"></div>
          ${yazabilir ? '<button id="yeni-kampanya-btn">+ Yeni Kampanya</button>' : ''}
        </div>
        <div class="stat-row" id="kampanya-ozet"></div>
        <div class="card">
          <table>
            <thead><tr><th>Kampanya</th><th>Kural</th><th>Hedef</th><th>Tarih</th><th>Durum</th><th class="num">Kullanım</th><th class="num">Verilen İndirim</th><th></th></tr></thead>
            <tbody id="kampanya-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async () => {
        [liste, ilaclar] = await Promise.all([Api.get('/api/kampanyalar'), Api.get('/api/ilaclar')]);
        const aktifSayi = liste.filter((k) => k.durum === 'aktif').length;
        const toplamIndirim = liste.reduce((t, k) => t + k.toplam_indirim, 0);
        document.getElementById('kampanya-ozet').innerHTML = `
          <div class="stat-tile c-mint"><div class="label">Aktif Kampanya</div><div class="value">${aktifSayi}</div></div>
          <div class="stat-tile c-lilac"><div class="label">Planlanan</div><div class="value">${liste.filter((k) => k.durum === 'planlandi').length}</div></div>
          <div class="stat-tile c-rose"><div class="label">Toplam Verilen İndirim</div><div class="value">${UI.tl(toplamIndirim)}</div></div>
        `;
        document.getElementById('kampanya-tbody').innerHTML = liste.length
          ? liste
              .map(
                (k) => `<tr>
                  <td>${UI.esc(k.ad)}</td>
                  <td>${kuralMetni(k)}</td>
                  <td>${UI.esc(k.hedef_adi)}</td>
                  <td>${tarihAraligi(k)}</td>
                  <td>${DURUM_ROZETI[k.durum] || k.durum}</td>
                  <td class="num">${k.kullanim_sayisi}</td>
                  <td class="num">${UI.tl(k.toplam_indirim)}</td>
                  <td class="actions-col">${
                    yazabilir
                      ? `<button class="secondary" data-action="duzenle" data-id="${k.id}">Düzenle</button>
                         <button class="danger" data-action="sil" data-id="${k.id}">Sil</button>`
                      : ''
                  }</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="8" class="empty-state">Henüz kampanya yok</td></tr>';
      };

      if (yazabilir) {
        document.getElementById('yeni-kampanya-btn').addEventListener('click', () => {
          const modal = UI.openModal(formHtml(null));
          formuBagla(modal, null, yenile);
        });
      }

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const kampanya = liste.find((k) => k.id === Number(btn.dataset.id));
        if (!kampanya) return;
        if (btn.dataset.action === 'duzenle') {
          const modal = UI.openModal(formHtml(kampanya));
          formuBagla(modal, kampanya, yenile);
        } else if (btn.dataset.action === 'sil') {
          if (!(await UI.confirmSil(`"${kampanya.ad}" kampanyası silinsin mi?`))) return;
          try {
            await Api.del(`/api/kampanyalar/${kampanya.id}`);
            UI.toast('Kampanya silindi', 'success');
            yenile();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });

      await yenile();
    }
  };

  Views.kampanyalar = view;
})();
