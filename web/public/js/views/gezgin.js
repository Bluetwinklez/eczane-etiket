(function () {
  const view = {
    async render(container) {
      const durum = { tip: '', kategori: '', marka: '', q: '', stokta: false, sirala: '', limit: 48 };

      container.innerHTML = `
        <div class="toolbar" id="gz-tipler"></div>
        <div style="display:grid;grid-template-columns:minmax(200px,260px) 1fr;gap:16px;align-items:start">
          <div class="card" id="gz-yan"></div>
          <div>
            <div class="toolbar">
              <input id="gz-ara" placeholder="Listelenenler arasında ara…" />
              <select id="gz-sirala" style="width:auto"><option value="">Ada göre</option><option value="fiyat_artan">Fiyat (artan)</option><option value="fiyat_azalan">Fiyat (azalan)</option><option value="stok">Stok</option></select>
              <label style="font-weight:400;white-space:nowrap"><input type="checkbox" id="gz-stokta" /> Sadece stokta</label>
              <span class="badge muted" id="gz-toplam"></span>
            </div>
            <div id="gz-urunler" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px"></div>
            <div id="gz-daha" style="text-align:center;margin-top:14px"></div>
          </div>
        </div>`;

      const yenile = async () => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(durum)) if (v) p.set(k, v === true ? '1' : v);
        let v;
        try {
          v = await Api.get('/api/ilac-bilgi/gezgin?' + p.toString());
        } catch (err) {
          return UI.toast(err.message, 'error');
        }
        document.getElementById('gz-tipler').innerHTML =
          `<button class="secondary${!durum.tip ? ' active' : ''}" data-tip="">Tümü</button>` +
          v.tipler.map((t) => `<button class="secondary${durum.tip === t.tip ? ' active' : ''}" data-tip="${t.tip}">${UI.esc(t.ad)} (${t.adet})</button>`).join('');
        const liste = (baslik, alan, secili, kayitlar) => `<h4 style="margin:0 0 6px">${baslik}</h4>
          <div style="max-height:260px;overflow:auto;margin-bottom:14px">
            <div class="satir" data-${alan}="" style="cursor:pointer;padding:4px 2px;${!secili ? 'font-weight:700' : ''}">Tümü</div>
            ${kayitlar.map((k) => `<div class="satir" data-${alan}="${UI.esc(k.ad)}" style="cursor:pointer;padding:4px 2px;${secili === k.ad ? 'font-weight:700' : ''}">${UI.esc(k.ad)} <small style="color:var(--text-muted)">(${k.adet})</small></div>`).join('')}
          </div>`;
        document.getElementById('gz-yan').innerHTML = liste('Kategoriler', 'kategori', durum.kategori, v.kategoriler) + liste('Markalar / firmalar', 'marka', durum.marka, v.markalar);
        document.getElementById('gz-toplam').textContent = `Toplam eşleşen ürün: ${v.toplam}`;
        document.getElementById('gz-urunler').innerHTML = v.urunler.length
          ? v.urunler
              .map(
                (u) => `<div class="card" style="padding:12px;display:flex;flex-direction:column;gap:6px">
                  <small style="color:var(--text-muted)">${UI.esc(u.uretici || '')}</small>
                  <b style="min-height:2.6em">${UI.esc(u.ad)}</b>
                  <small style="color:var(--text-muted)">${UI.esc(u.barkod || '')}${u.kategori ? ' · ' + UI.esc(u.kategori) : ''}</small>
                  <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:1.15em;font-weight:700">${UI.tl(u.satis_fiyati)}</span>
                    <span class="badge ${u.stok > 0 ? 'ok' : 'danger'}">${u.stok > 0 ? 'Stok ' + u.stok : 'Stokta yok'}</span></div>
                  <button class="secondary" data-kart="${u.id}">İlaç kartı</button></div>`
              )
              .join('')
          : '<div class="card empty-state" style="grid-column:1/-1">Bu süzgeçlerle ürün bulunamadı.</div>';
        document.getElementById('gz-daha').innerHTML = v.toplam > v.urunler.length ? '<button class="secondary" id="gz-daha-btn">Daha fazla göster</button>' : '';
      };

      container.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tip]');
        if (t) {
          Object.assign(durum, { tip: t.dataset.tip, kategori: '', marka: '', limit: 48 });
          return yenile();
        }
        const k = e.target.closest('[data-kategori]');
        if (k) {
          Object.assign(durum, { kategori: k.dataset.kategori, limit: 48 });
          return yenile();
        }
        const m = e.target.closest('[data-marka]');
        if (m) {
          Object.assign(durum, { marka: m.dataset.marka, limit: 48 });
          return yenile();
        }
        const kart = e.target.closest('[data-kart]');
        if (kart) return window.IlacKartiAc(Number(kart.dataset.kart));
        if (e.target.id === 'gz-daha-btn') {
          durum.limit += 48;
          yenile();
        }
      });
      let zaman;
      document.getElementById('gz-ara').addEventListener('input', (e) => {
        clearTimeout(zaman);
        zaman = setTimeout(() => {
          Object.assign(durum, { q: e.target.value.trim(), limit: 48 });
          yenile();
        }, 250);
      });
      document.getElementById('gz-sirala').addEventListener('change', (e) => {
        durum.sirala = e.target.value;
        yenile();
      });
      document.getElementById('gz-stokta').addEventListener('change', (e) => {
        durum.stokta = e.target.checked;
        yenile();
      });
      await yenile();
    }
  };

  Views.gezgin = view;
})();
