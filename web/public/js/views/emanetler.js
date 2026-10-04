(function () {
  const view = {
    async render(container) {
      const ilaclar = await Api.get('/api/ilaclar');
      container.innerHTML = `
        <div class="card">
          <h3>Yeni Emanet Kaydı</h3>
          <form id="em-form" class="form-grid">
            <div><label>Yön</label><select name="yon"><option value="alinan">Alınan (başka eczaneden aldık)</option><option value="verilen">Verilen (başka eczaneye verdik)</option></select></div>
            <div><label>Karşı Eczane</label><input name="karsi_eczane" list="em-eczaneler" required /><datalist id="em-eczaneler"></datalist></div>
            <div><label>Telefon</label><input name="telefon" /></div>
            <div><label>Ürün</label><select name="ilac_id">${ilaclar.map((i) => `<option value="${i.id}">${UI.esc(i.ad)} (stok ${i.stok})</option>`).join('')}</select></div>
            <div><label>Adet</label><input name="adet" type="number" min="1" value="1" required /></div>
            <div><label>Not</label><input name="notlar" /></div>
            <div><button type="submit">Kaydet</button></div>
          </form>
          <p class="form-ipucu">Alınan emanet stoğa girer, verilen emanet stoktan düşer. Kapatırken "ürün olarak iade" seçilirse stok ters işlenir; "mahsup" (para veya başka ürünle kapandı) seçilirse stoğa dokunulmaz.</p>
        </div>
        <div class="card">
          <h3>Eczane Bazında Açık Emanetler</h3>
          <table><thead><tr><th>Eczane</th><th class="num">Bizim Borcumuz</th><th class="num">Alacağımız</th></tr></thead><tbody id="em-ozet"></tbody></table>
        </div>
        <div class="card">
          <h3>Emanet Defteri</h3>
          <table><thead><tr><th>Tarih</th><th>Yön</th><th>Eczane</th><th>Ürün</th><th class="num">Adet</th><th>Durum</th><th>Not</th><th></th></tr></thead><tbody id="em-tbody"></tbody></table>
        </div>
      `;

      const yenile = async () => {
        const { emanetler, eczaneler } = await Api.get('/api/emanetler');
        document.getElementById('em-eczaneler').innerHTML = [...new Set(emanetler.map((e) => e.karsi_eczane))].map((a) => `<option value="${UI.esc(a)}">`).join('');
        document.getElementById('em-ozet').innerHTML = eczaneler.length
          ? eczaneler
              .map(
                (o) => `<tr><td>${UI.esc(o.karsi_eczane)}</td>
                  <td class="num">${o.alinan_adet ? `${o.alinan_adet} kutu · ${UI.tl(o.borc_degeri)}` : '-'}</td>
                  <td class="num">${o.verilen_adet ? `${o.verilen_adet} kutu · ${UI.tl(o.alacak_degeri)}` : '-'}</td></tr>`
              )
              .join('')
          : '<tr><td colspan="3" class="empty-state">Açık emanet yok</td></tr>';
        document.getElementById('em-tbody').innerHTML = emanetler.length
          ? emanetler
              .map(
                (e) => `<tr>
                  <td>${UI.tarih(e.tarih)}</td>
                  <td>${e.yon === 'alinan' ? '<span class="badge warn">Alınan</span>' : '<span class="badge muted">Verilen</span>'}</td>
                  <td>${UI.esc(e.karsi_eczane)}${e.telefon ? `<br><small>${UI.esc(e.telefon)}</small>` : ''}</td>
                  <td>${UI.esc(e.ilac_adi)}</td>
                  <td class="num">${e.adet}</td>
                  <td>${e.durum === 'acik' ? '<span class="badge danger">Açık</span>' : `<span class="badge ok">Kapandı</span> <small>${e.kapanis_sekli === 'mahsup' ? 'mahsup' : 'ürün iadesi'}</small>`}</td>
                  <td>${UI.esc(e.notlar || '')}</td>
                  <td class="actions-col">${
                    e.durum === 'acik'
                      ? `<button class="secondary" data-kapat="${e.id}" data-sekil="urun_iade">${e.yon === 'alinan' ? 'Geri verdik' : 'Geri geldi'}</button>
                         <button class="secondary" data-kapat="${e.id}" data-sekil="mahsup">Mahsup</button>`
                      : ''
                  }</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="8" class="empty-state">Kayıt yok</td></tr>';
      };

      document.getElementById('em-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await Api.post('/api/emanetler', {
            yon: fd.get('yon'),
            karsi_eczane: fd.get('karsi_eczane'),
            telefon: fd.get('telefon') || null,
            ilac_id: Number(fd.get('ilac_id')),
            adet: Number(fd.get('adet')),
            notlar: fd.get('notlar') || null
          });
          UI.toast('Emanet kaydedildi, stok güncellendi', 'success');
          e.target.reset();
          yenile();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      container.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-kapat]');
        if (!b) return;
        const metin = b.dataset.sekil === 'mahsup' ? 'Emanet mahsup edilerek kapatılsın mı? (stoğa dokunulmaz)' : 'Emanet ürün iadesiyle kapatılsın mı? (stok güncellenir)';
        if (!window.confirm(metin)) return;
        try {
          await Api.post(`/api/emanetler/${b.dataset.kapat}/kapat`, { sekil: b.dataset.sekil });
          UI.toast('Emanet kapatıldı', 'success');
          yenile();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      await yenile();
    }
  };

  Views.emanetler = view;
})();
