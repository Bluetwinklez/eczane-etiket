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
        <button class="secondary" data-action="partiler" data-id="${ilac.id}">Partiler</button>
        <button class="secondary" data-action="fiyat-gecmisi" data-id="${ilac.id}">Fiyat Geçmişi</button>
        <button class="secondary" data-action="stok-hareketleri" data-id="${ilac.id}">Stok Geçmişi</button>
        ${ctx.user.rol === 'admin' ? `<button class="danger" data-action="sil" data-id="${ilac.id}">Sil</button>` : ''}
      `
      : `<button class="secondary" data-action="partiler" data-id="${ilac.id}">Partiler</button>
         <button class="secondary" data-action="fiyat-gecmisi" data-id="${ilac.id}">Fiyat Geçmişi</button>
         <button class="secondary" data-action="stok-hareketleri" data-id="${ilac.id}">Stok Geçmişi</button>`;

    return `
      <tr>
        <td>${UI.esc(ilac.ad)}${ilac.etken_madde ? `<br /><small class="etken-madde">${UI.esc(ilac.etken_madde)}</small>` : ''} ${ilac.urun_tipi && ilac.urun_tipi !== 'ilac' ? `<span class="badge tip-${ilac.urun_tipi}">${UI.URUN_TIPLERI[ilac.urun_tipi] || ilac.urun_tipi}</span>` : ''} ${ilac.receteli ? '<span class="badge muted">Reçeteli</span>' : ''} ${sktRozeti(ilac.en_yakin_skt)}</td>
        <td>${UI.esc(ilac.barkod || '-')}</td>
        <td>${UI.esc(ilac.kategori || '-')}</td>
        <td class="num">${ilac.stok} ${stokRozeti}</td>
        <td class="num">${UI.tl(ilac.satis_fiyati)}</td>
        <td>${ilac.en_yakin_skt || '-'}${ilac.aktif_parti_sayisi > 1 ? ` <span class="badge muted" title="Elde stoğu olan parti sayısı">${ilac.aktif_parti_sayisi} parti</span>` : ''}</td>
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
          <div>
            <label>Ürün Tipi</label>
            <select name="urun_tipi">
              ${Object.entries(UI.URUN_TIPLERI).map(([v, l]) => `<option value="${v}" ${(i.urun_tipi || 'ilac') === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div><label>Kategori</label><input name="kategori" value="${UI.esc(i.kategori || '')}" /></div>
          <div><label>Etken Madde</label><input name="etken_madde" value="${UI.esc(i.etken_madde || '')}" placeholder="örn. amoksisilin, klavulanik asit" title="Etkileşim kontrolü için; birden fazlaysa virgülle ayırın" /></div>
          <div><label>Üretici</label><input name="uretici" value="${UI.esc(i.uretici || '')}" /></div>
          <div><label>Alış Fiyatı</label><input name="alis_fiyati" type="number" step="0.01" min="0" value="${i.alis_fiyati ?? ''}" /></div>
          <div><label>Satış Fiyatı</label><input name="satis_fiyati" type="number" step="0.01" min="0" required value="${i.satis_fiyati ?? ''}" /></div>
          <div><label>Kritik Stok Sınırı</label><input name="kritik_stok" type="number" min="0" value="${i.kritik_stok ?? 10}" /></div>
          <div><label>Varsayılan SKT</label><input name="skt" type="date" value="${i.skt || ''}" title="SKT girilmeyen stok girişlerinde kullanılır" /></div>
          ${!ilac ? '<div><label>Başlangıç Stoku</label><input name="stok" type="number" min="0" value="0" /></div><div><label>Parti / Lot No</label><input name="parti_no" placeholder="opsiyonel" /></div>' : ''}
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
      parti_no: fd.has('parti_no') ? fd.get('parti_no') || null : undefined,
      receteli: form.querySelector('[name="receteli"]').checked,
      urun_tipi: fd.get('urun_tipi'),
      etken_madde: fd.get('etken_madde') || null
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

  function partiSktRozeti(skt) {
    if (!skt) return '<span class="badge muted">SKT yok</span>';
    const gun = Math.ceil((new Date(skt) - new Date()) / (1000 * 60 * 60 * 24));
    if (gun < 0) return '<span class="badge danger">SKT geçti</span>';
    if (gun <= 30) return `<span class="badge warn">${gun} gün</span>`;
    if (gun <= 180) return `<span class="badge muted">${gun} gün</span>`;
    return '<span class="badge ok">Uzun</span>';
  }

  async function partileriGoster(ilac, ctx, onDegisti) {
    const partiler = await Api.get(`/api/ilaclar/${ilac.id}/partiler`);
    const yazabilir = yazmaYetkisiVar(ctx);
    const satirlar = partiler.length
      ? partiler
          .map(
            (p, idx) => `<tr>
              <td>${UI.esc(p.parti_no || '-')} ${idx === 0 ? '<span class="badge ok" title="Satışta ilk bu partiden düşülür">Sıradaki</span>' : ''}</td>
              <td>${p.skt || '-'} ${partiSktRozeti(p.skt)}</td>
              <td class="num">${p.miktar} / ${p.giris_miktari}</td>
              <td>${UI.esc(p.kaynak || '-')}</td>
              <td>${UI.tarih(p.giris_tarihi)}</td>
              ${yazabilir ? `<td><button class="secondary" data-parti-cikis="${p.id}" data-miktar="${p.miktar}">Çıkış/İmha</button></td>` : ''}
            </tr>`
          )
          .join('')
      : `<tr><td colspan="${yazabilir ? 6 : 5}" class="empty-state">Elde stoğu olan parti yok</td></tr>`;

    const modal = UI.openModal(`
      <h3 class="modal-genis">Partiler — ${UI.esc(ilac.ad)}</h3>
      <p class="form-ipucu">Satışlarda stok, SKT'si en yakın partiden başlayarak düşülür (FEFO).</p>
      <table>
        <thead><tr><th>Parti No</th><th>SKT</th><th class="num">Kalan / Giriş</th><th>Kaynak</th><th>Giriş Tarihi</th>${yazabilir ? '<th></th>' : ''}</tr></thead>
        <tbody>${satirlar}</tbody>
      </table>
      <div class="modal-actions"><button class="secondary" data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
    modal.querySelectorAll('[data-parti-cikis]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const azami = Number(btn.dataset.miktar);
        const girdi = window.prompt(`Bu partiden kaç adet çıkış yapılsın? (en fazla ${azami})`, String(azami));
        if (girdi === null) return;
        const adet = Number(girdi);
        if (!Number.isInteger(adet) || adet <= 0 || adet > azami) {
          UI.toast('Geçersiz adet', 'error');
          return;
        }
        try {
          await Api.post(`/api/ilaclar/${ilac.id}/stok`, {
            tip: 'cikis',
            adet,
            parti_id: Number(btn.dataset.partiCikis),
            aciklama: 'Parti çıkışı / imha'
          });
          UI.toast('Parti çıkışı kaydedildi', 'success');
          UI.closeModal(modal);
          onDegisti();
          partileriGoster(ilac, ctx, onDegisti);
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
    });
  }

  const HAREKET_ROZETI = {
    giris: '<span class="badge ok">Giriş</span>',
    cikis: '<span class="badge danger">Çıkış</span>'
  };

  async function stokHareketleriGoster(id, ad) {
    const hareketler = await Api.get(`/api/ilaclar/${id}/hareketler`);
    const satirlar = hareketler.length
      ? hareketler
          .map(
            (h) =>
              `<tr><td>${UI.tarih(h.tarih)}</td><td>${HAREKET_ROZETI[h.tip] || h.tip}</td><td class="num">${h.adet}</td><td>${UI.esc(h.aciklama || '-')}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="4" class="empty-state">Stok hareketi kaydı yok</td></tr>';

    const modal = UI.openModal(`
      <h3>Stok Geçmişi — ${UI.esc(ad)}</h3>
      <table><thead><tr><th>Tarih</th><th>Tip</th><th class="num">Adet</th><th>Açıklama</th></tr></thead>
      <tbody>${satirlar}</tbody></table>
      <div class="modal-actions"><button class="secondary" data-action="kapat">Kapat</button></div>
    `);
    modal.querySelector('[data-action="kapat"]').addEventListener('click', () => UI.closeModal(modal));
  }

  const view = {
    async render(container, ctx) {
      container.innerHTML = `
        <div class="toolbar">
          <input id="ilac-ara" placeholder="İlaç, barkod, etken madde veya kategori ara..." style="max-width:320px" />
          <select id="ilac-tip-filtre" style="max-width:200px">
            <option value="">Tüm ürün tipleri</option>
            ${Object.entries(UI.URUN_TIPLERI).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
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
        // Arama kutusuna karekod okutulursa icindeki barkodla ara
        if (q && UI.karekodaBenziyor(q)) {
          try {
            q = (await UI.karekodSorgula(q)).karekod.barkod;
          } catch (err) {
            /* cozulemezse oldugu gibi ara */
          }
        }
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        const tip = document.getElementById('ilac-tip-filtre').value;
        if (tip) params.set('urun_tipi', tip);
        mevcutListe = await Api.get('/api/ilaclar?' + params.toString());
        const tbody = document.getElementById('ilac-tbody');
        tbody.innerHTML = mevcutListe.length
          ? mevcutListe.map((i) => satirHtml(i, ctx)).join('')
          : '<tr><td colspan="7" class="empty-state">Kayıt bulunamadı</td></tr>';
      };

      let aramaTimer;
      document.getElementById('ilac-tip-filtre').addEventListener('change', () => yenile(document.getElementById('ilac-ara').value));
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
        } else if (btn.dataset.action === 'partiler') {
          partileriGoster(ilac, ctx, () => yenile(document.getElementById('ilac-ara').value));
        } else if (btn.dataset.action === 'fiyat-gecmisi') {
          fiyatGecmisiGoster(id);
        } else if (btn.dataset.action === 'stok-hareketleri') {
          stokHareketleriGoster(id, ilac.ad);
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

      const seed = UI.aramaSeedOku();
      if (seed) document.getElementById('ilac-ara').value = seed;
      await yenile(seed);
    }
  };

  Views.ilaclar = view;
})();
