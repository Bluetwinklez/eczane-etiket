// e-Arsiv faturalar: satistan UBL-TR XML taslagi olusturma, liste ve fatura bilgileri.
// XML entegrator / GIB e-Arsiv portalina yuklenir; imzalama ve GIB'e raporlama orada yapilir.
(function () {
  const TIPLER = [
    ['ilac', 'İlaç'],
    ['medikal', 'Medikal'],
    ['takviye', 'Gıda takviyesi'],
    ['dermokozmetik', 'Dermokozmetik'],
    ['diger', 'Diğer']
  ];

  function xmlIndir(satisId) {
    const a = document.createElement('a');
    a.href = `/api/e-arsiv/satis/${satisId}/xml`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Kasadan ya da listeden: alici bilgisiyle faturayi olusturur (zaten varsa mevcut faturayi gosterir)
  async function faturaAc(satisId, musteri = null) {
    const mevcut = await Api.get(`/api/e-arsiv/satis/${satisId}`);
    if (mevcut) {
      const m = UI.openModal(`
        <h3>e-Arşiv fatura</h3>
        <p>Bu satışın faturası zaten oluşturulmuş: <b>${UI.esc(mevcut.fatura_no)}</b> · ${UI.esc(mevcut.alici_ad)} · ${UI.tl(mevcut.toplam)}</p>
        <div class="modal-actions"><button class="secondary" data-action="kapat">Kapat</button><button data-action="indir">XML indir</button></div>`);
      m.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(m));
      m.querySelector('[data-action="indir"]').addEventListener('click', () => xmlIndir(satisId));
      return;
    }
    const m = UI.openModal(`
      <h3>e-Arşiv fatura — satış #${satisId}</h3>
      <p class="form-ipucu" style="margin-top:0">Kimlik numarası boş bırakılırsa "nihai tüketici" (11111111111) adına kesilir. Şirket adına fatura için 10 haneli VKN girin.</p>
      <form id="ea-form">
        <div class="form-grid">
          <div><label>Ad soyad / ünvan</label><input name="ad_soyad" value="${UI.esc((musteri && musteri.ad_soyad) || '')}" maxlength="120" /></div>
          <div><label>TCKN / VKN</label><input name="tc_no" value="${UI.esc((musteri && musteri.tc_no) || '')}" inputmode="numeric" maxlength="11" /></div>
          <div style="grid-column:1/-1"><label>Adres</label><input name="adres" value="${UI.esc((musteri && musteri.adres) || '')}" maxlength="200" /></div>
          <div><label>İl</label><input name="il" placeholder="Boşsa eczanenin ili" maxlength="40" /></div>
          <div><label>E-posta</label><input name="eposta" type="email" value="${UI.esc((musteri && musteri.email) || '')}" maxlength="120" /></div>
        </div>
        <div class="modal-actions"><button type="button" class="secondary" data-action="kapat">Vazgeç</button><button type="submit">Faturayı oluştur</button></div>
      </form>`);
    m.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(m));
    m.querySelector('#ea-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alici = Object.fromEntries(new FormData(e.target));
      const dugme = e.target.querySelector('button[type=submit]');
      dugme.disabled = true;
      try {
        const f = await Api.post(`/api/e-arsiv/satis/${satisId}`, { alici });
        UI.closeModal(m);
        UI.toast(`Fatura ${f.fatura_no} oluşturuldu`, 'success');
        xmlIndir(satisId);
      } catch (err) {
        UI.toast(err.message, 'error');
        dugme.disabled = false;
      }
    });
  }

  function ayarFormu(a, admin) {
    const k = (ad, etiket, ek = '') =>
      `<div><label>${etiket}</label><input name="${ad}" value="${UI.esc(a[ad] || '')}" ${admin ? '' : 'disabled'} ${ek} /></div>`;
    return `
      <details class="card" style="margin-bottom:14px" ${a.eksik ? 'open' : ''}><summary style="cursor:pointer"><b>Fatura bilgileri</b> ${a.eksik ? '<span class="badge warn">Eksik</span>' : `<span class="badge ok">Hazır</span> <span class="form-ipucu">${UI.esc(a.unvan)} · ${UI.esc(a.vkn)} · seri ${UI.esc(a.seri)}</span>`}</summary>
      <form id="ea-ayar" style="margin-top:12px">
        ${a.eksik ? `<p class="form-ipucu" style="margin-top:0">${UI.esc(a.eksik)}</p>` : ''}
        <div class="form-grid">
          ${k('unvan', 'Ünvan', 'maxlength="200" placeholder="Örnek Eczanesi"')}
          ${k('vkn', 'VKN / TCKN', 'inputmode="numeric" maxlength="11"')}
          ${k('eczaci_adi', 'Eczacı adı soyadı (TCKN ile)', 'maxlength="120"')}
          ${k('vergi_dairesi', 'Vergi dairesi', 'maxlength="80"')}
          <div style="grid-column:1/-1"><label>Adres</label><input name="adres" value="${UI.esc(a.adres || '')}" ${admin ? '' : 'disabled'} maxlength="200" /></div>
          ${k('ilce', 'İlçe', 'maxlength="40"')}
          ${k('il', 'İl', 'maxlength="40"')}
          ${k('telefon', 'Telefon', 'maxlength="30"')}
          ${k('eposta', 'E-posta', 'type="email" maxlength="120"')}
          ${k('seri', 'Fatura serisi (3 karakter)', 'maxlength="3" style="text-transform:uppercase"')}
        </div>
        <p style="margin:14px 0 6px"><b>KDV oranları (%)</b> <span class="form-ipucu">Satış fiyatları KDV dahildir; oranları muhasebecinizle doğrulayın.</span></p>
        <div class="form-grid">
          ${TIPLER.map(([t, ad]) => `<div><label>${ad}</label><input name="kdv_${t}" type="number" min="0" max="100" step="1" value="${a.kdv[t]}" ${admin ? '' : 'disabled'} /></div>`).join('')}
        </div>
        ${admin ? '<div class="modal-actions" style="justify-content:flex-start"><button type="submit">Kaydet</button></div>' : '<p class="form-ipucu">Bilgileri yalnızca yönetici değiştirebilir.</p>'}
      </form></details>`;
  }

  const view = {
    async render(container, ctx) {
      const admin = ctx && ctx.user ? ctx.user.rol === 'admin' : CURRENT_USER.rol === 'admin';
      const ay = view.ay || new Date().toISOString().slice(0, 7);
      const [a, liste] = await Promise.all([Api.get('/api/e-arsiv/ayarlar'), Api.get(`/api/e-arsiv?ay=${ay}`)]);
      const toplam = liste.reduce((t, f) => ({ kdv_haric: t.kdv_haric + f.kdv_haric, kdv: t.kdv + f.kdv, toplam: t.toplam + f.toplam }), { kdv_haric: 0, kdv: 0, toplam: 0 });
      container.innerHTML = `
        ${ayarFormu(a, admin)}
        <div class="card">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
            <h3 style="margin:0;flex:1">Kesilen faturalar</h3>
            <input id="ea-ay" type="month" value="${ay}" style="width:auto" />
            <form id="ea-yeni" style="display:flex;gap:6px;margin:0"><input name="satis" type="number" min="1" placeholder="Satış no" style="width:120px" required /><button type="submit">Fatura kes</button></form>
          </div>
          <p class="form-ipucu" style="margin-top:0">Faturayı kasada satış tamamlanınca "🧾 e-Arşiv fatura" ile de kesebilirsiniz. İndirilen XML, entegratörünüzün ya da GİB e-Arşiv portalının "XML yükle" ekranına yüklenir; imza ve GİB raporlaması orada yapılır.</p>
          ${
            liste.length
              ? `<table><thead><tr><th>Fatura no</th><th>Tarih</th><th>Alıcı</th><th class="num">KDV hariç</th><th class="num">KDV</th><th class="num">Toplam</th><th></th></tr></thead><tbody>
                ${liste.map((f) => `<tr><td><b>${UI.esc(f.fatura_no)}</b><br><small class="form-ipucu">Satış #${f.satis_id}</small></td><td>${UI.esc(f.tarih.slice(0, 16))}</td><td>${UI.esc(f.alici_ad)}<br><small class="form-ipucu">${f.alici_kimlik === '11111111111' ? 'Nihai tüketici' : UI.esc(f.alici_kimlik)}</small></td><td class="num">${UI.tl(f.kdv_haric)}</td><td class="num">${UI.tl(f.kdv)}</td><td class="num">${UI.tl(f.toplam)}</td><td><a class="hap-link" href="/api/e-arsiv/satis/${f.satis_id}/xml" download>XML</a></td></tr>`).join('')}
                <tr><td colspan="3"><b>${liste.length} fatura</b></td><td class="num"><b>${UI.tl(toplam.kdv_haric)}</b></td><td class="num"><b>${UI.tl(toplam.kdv)}</b></td><td class="num"><b>${UI.tl(toplam.toplam)}</b></td><td></td></tr>
              </tbody></table>`
              : '<p class="form-ipucu">Bu ay kesilmiş fatura yok.</p>'
          }
        </div>`;

      container.querySelector('#ea-ay').addEventListener('change', (e) => {
        view.ay = e.target.value;
        view.render(container, ctx);
      });
      container.querySelector('#ea-yeni').addEventListener('submit', async (e) => {
        e.preventDefault();
        await faturaAc(Number(e.target.satis.value)).catch((err) => UI.toast(err.message, 'error'));
      });
      const form = container.querySelector('#ea-ayar');
      if (admin)
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(form));
          const kdv = {};
          for (const [t] of TIPLER) kdv[t] = Number(v['kdv_' + t]);
          try {
            await Api.put('/api/e-arsiv/ayarlar', { ...v, kdv });
            UI.toast('Fatura bilgileri kaydedildi', 'success');
            view.render(container, ctx);
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
    }
  };

  Views.eArsiv = view;
  window.EczamEArsiv = { faturaAc };
})();
