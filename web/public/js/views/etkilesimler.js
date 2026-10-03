(function () {
  const SEVIYE_ROZETI = {
    ciddi: '<span class="badge danger">Ciddi</span>',
    orta: '<span class="badge warn">Orta</span>',
    hafif: '<span class="badge muted">Hafif</span>'
  };

  let kurallar = [];
  let ilaclar = [];
  let secilenler = [];

  function yazmaYetkisiVar(ctx) {
    return ctx.user.rol === 'admin' || ctx.user.rol === 'eczaci';
  }

  async function kontrolEt() {
    const sonucDiv = document.getElementById('etk-sonuc');
    const liste = document.getElementById('etk-secilenler');
    liste.innerHTML = secilenler.length
      ? secilenler
          .map(
            (i) => `<span class="badge muted etk-cip">${UI.esc(i.ad)}${i.etken_madde ? ` <small>(${UI.esc(i.etken_madde)})</small>` : ''}
              <button type="button" class="secondary" data-cikar="${i.id}" title="Çıkar">✕</button></span>`
          )
          .join('')
      : '<span class="form-ipucu">Kontrol için en az iki ürün ekleyin.</span>';

    if (secilenler.length < 2) {
      sonucDiv.innerHTML = '';
      return;
    }
    const sonuc = await Api.post('/api/etkilesimler/kontrol', { ilac_ids: secilenler.map((i) => i.id) });
    const satirlar = [
      ...sonuc.etkilesimler.map(
        (e) => `<div class="etkilesim ${e.seviye}"><b>${SEVIYE_ROZETI[e.seviye]} ${UI.esc(e.urun_a)} + ${UI.esc(e.urun_b)}</b><br /><small>${UI.esc(e.madde_a)} × ${UI.esc(e.madde_b)}: ${UI.esc(e.aciklama)}</small></div>`
      ),
      ...sonuc.mukerrer.map(
        (m) => `<div class="etkilesim orta"><b>Mükerrer etken madde:</b> ${UI.esc(m.urun_a)} ve ${UI.esc(m.urun_b)} — ${UI.esc(m.madde)}</div>`
      )
    ];
    const etkenMaddesiz = secilenler.filter((i) => !i.etken_madde);
    sonucDiv.innerHTML =
      (satirlar.length ? satirlar.join('') : '<div class="etkilesim hafif">Kayıtlı bir etkileşim bulunamadı.</div>') +
      (etkenMaddesiz.length
        ? `<p class="form-ipucu">Etken maddesi girilmemiş ürünler kontrol edilemedi: ${etkenMaddesiz.map((i) => UI.esc(i.ad)).join(', ')}</p>`
        : '');
  }

  const view = {
    async render(container, ctx) {
      const yazabilir = yazmaYetkisiVar(ctx);
      secilenler = [];
      container.innerHTML = `
        <div class="card" style="border-left:4px solid var(--warning)">
          <p style="margin:0;font-size:13px">⚠️ Bu modüldeki etkileşim listesi <b>sınırlı bir örnek veri setidir</b> ve klinik karar destek sisteminin
          ya da eczacı değerlendirmesinin yerini tutmaz. Kendi eczanenizin kaynaklarına göre kuralları ekleyip düzenleyebilirsiniz.</p>
        </div>
        <div class="card">
          <h3>Etkileşim Kontrolü</h3>
          <div class="toolbar" style="margin:0">
            <select id="etk-ilac" style="max-width:360px"></select>
            <button id="etk-ekle" class="secondary">Ekle</button>
            <button id="etk-temizle" class="secondary">Temizle</button>
          </div>
          <div id="etk-secilenler" style="margin:10px 0;display:flex;flex-wrap:wrap;gap:6px"></div>
          <div id="etk-sonuc"></div>
        </div>
        <div class="card">
          <h3>Kayıtlı Etkileşimler</h3>
          ${
            yazabilir
              ? `<form id="etk-form" class="form-grid" style="margin-bottom:12px">
                  <div><label>Etken Madde A</label><input name="madde_a" list="etk-maddeler" required /></div>
                  <div><label>Etken Madde B</label><input name="madde_b" list="etk-maddeler" required /></div>
                  <div><label>Seviye</label><select name="seviye"><option value="ciddi">Ciddi</option><option value="orta" selected>Orta</option><option value="hafif">Hafif</option></select></div>
                  <div style="grid-column:1/-1"><label>Açıklama</label><input name="aciklama" required placeholder="Etkileşimin sonucu ve öneri" /></div>
                  <div><button type="submit">+ Etkileşim Ekle</button></div>
                  <datalist id="etk-maddeler"></datalist>
                </form>`
              : ''
          }
          <table>
            <thead><tr><th>Etken Madde A</th><th>Etken Madde B</th><th>Seviye</th><th>Açıklama</th><th></th></tr></thead>
            <tbody id="etk-tbody"></tbody>
          </table>
        </div>
      `;

      const yenile = async () => {
        [kurallar, ilaclar] = await Promise.all([Api.get('/api/etkilesimler'), Api.get('/api/ilaclar')]);
        document.getElementById('etk-ilac').innerHTML = ilaclar
          .map((i) => `<option value="${i.id}">${UI.esc(i.ad)}${i.etken_madde ? ' — ' + UI.esc(i.etken_madde) : ''}</option>`)
          .join('');
        const maddeler = new Set();
        ilaclar.forEach((i) => (i.etken_madde || '').split(',').forEach((m) => m.trim() && maddeler.add(m.trim())));
        kurallar.forEach((k) => {
          maddeler.add(k.madde_a);
          maddeler.add(k.madde_b);
        });
        const datalist = document.getElementById('etk-maddeler');
        if (datalist) datalist.innerHTML = [...maddeler].sort().map((m) => `<option value="${UI.esc(m)}">`).join('');
        document.getElementById('etk-tbody').innerHTML = kurallar.length
          ? kurallar
              .map(
                (k) => `<tr>
                  <td>${UI.esc(k.madde_a)}</td>
                  <td>${UI.esc(k.madde_b)}</td>
                  <td>${SEVIYE_ROZETI[k.seviye]}</td>
                  <td>${UI.esc(k.aciklama)}</td>
                  <td class="actions-col">${yazabilir ? `<button class="danger" data-sil="${k.id}">Sil</button>` : ''}</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="5" class="empty-state">Kayıtlı etkileşim yok</td></tr>';
        await kontrolEt();
      };

      document.getElementById('etk-ekle').addEventListener('click', () => {
        const id = Number(document.getElementById('etk-ilac').value);
        const ilac = ilaclar.find((i) => i.id === id);
        if (ilac && !secilenler.some((s) => s.id === id)) secilenler.push(ilac);
        kontrolEt();
      });
      document.getElementById('etk-temizle').addEventListener('click', () => {
        secilenler = [];
        kontrolEt();
      });

      const form = document.getElementById('etk-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          try {
            await Api.post('/api/etkilesimler', {
              madde_a: fd.get('madde_a'),
              madde_b: fd.get('madde_b'),
              seviye: fd.get('seviye'),
              aciklama: fd.get('aciklama')
            });
            UI.toast('Etkileşim eklendi', 'success');
            form.reset();
            yenile();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      }

      container.addEventListener('click', async (e) => {
        const cikar = e.target.closest('button[data-cikar]');
        if (cikar) {
          secilenler = secilenler.filter((s) => s.id !== Number(cikar.dataset.cikar));
          kontrolEt();
          return;
        }
        const sil = e.target.closest('button[data-sil]');
        if (sil) {
          if (!(await UI.confirmSil('Bu etkileşim kaydı silinsin mi?'))) return;
          try {
            await Api.del(`/api/etkilesimler/${sil.dataset.sil}`);
            UI.toast('Etkileşim silindi', 'success');
            yenile();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        }
      });

      await yenile();
    }
  };

  Views.etkilesimler = view;
})();
