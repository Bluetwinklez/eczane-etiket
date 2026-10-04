(function () {
  const DURUM = {
    bekliyor: '<span class="badge warn">Bekliyor</span>',
    haber_verildi: '<span class="badge muted">Haber verildi</span>',
    teslim_edildi: '<span class="badge ok">Teslim edildi</span>',
    iptal: '<span class="badge muted">İptal</span>'
  };

  const view = {
    async render(container) {
      const [musteriler, ilaclar] = await Promise.all([Api.get('/api/musteriler'), Api.get('/api/ilaclar')]);
      container.innerHTML = `
        <div class="card">
          <h3>Yeni İstek / Eksik Kaydı</h3>
          <form id="ist-form" class="form-grid">
            <div><label>Kayıtlı Müşteri</label><select name="musteri_id"><option value="">- Kayıtsız müşteri -</option>${musteriler.map((m) => `<option value="${m.id}">${UI.esc(m.ad_soyad)}</option>`).join('')}</select></div>
            <div class="ist-kayitsiz"><label>Müşteri Adı</label><input name="musteri_adi" /></div>
            <div class="ist-kayitsiz"><label>Telefon</label><input name="telefon" /></div>
            <div><label>Ürün (katalogdan)</label><select name="ilac_id"><option value="">- Katalogda yok -</option>${ilaclar.map((i) => `<option value="${i.id}">${UI.esc(i.ad)} (stok ${i.stok})</option>`).join('')}</select></div>
            <div><label>veya Ürün Adı</label><input name="urun_adi" placeholder="Katalogda olmayan ürün" /></div>
            <div><label>Adet</label><input name="adet" type="number" min="1" value="1" /></div>
            <div style="grid-column:1/-1"><label>Not</label><input name="notlar" /></div>
            <div><button type="submit">Kaydet</button></div>
          </form>
        </div>
        <div class="toolbar">
          <select id="ist-filtre" style="max-width:200px">
            <option value="acik" selected>Açık istekler</option>
            <option value="teslim_edildi">Teslim edilenler</option>
            <option value="iptal">İptal edilenler</option>
            <option value="">Tümü</option>
          </select>
          <span class="form-ipucu" id="ist-ozet" style="margin:0"></span>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>Tarih</th><th>Müşteri</th><th>Ürün</th><th class="num">Adet</th><th>Stok</th><th>Durum</th><th>Not</th><th></th></tr></thead>
            <tbody id="ist-tbody"></tbody>
          </table>
        </div>
      `;

      const form = document.getElementById('ist-form');
      const kayitsizGuncelle = () => form.querySelectorAll('.ist-kayitsiz').forEach((el) => (el.hidden = Boolean(form.musteri_id.value)));
      form.musteri_id.addEventListener('change', kayitsizGuncelle);
      kayitsizGuncelle();

      const yenile = async () => {
        const liste = await Api.get('/api/istekler?durum=' + document.getElementById('ist-filtre').value);
        const gelen = liste.filter((i) => i.stokta_var).length;
        document.getElementById('ist-ozet').innerHTML = gelen ? `<b style="color:var(--success)">${gelen} istenen ürün stokta — müşteriye haber verin</b>` : '';
        document.getElementById('ist-tbody').innerHTML = liste.length
          ? liste
              .map(
                (i) => `<tr${i.stokta_var ? ' style="background:var(--accent-mint-bg)"' : ''}>
                  <td>${UI.tarih(i.tarih)}</td>
                  <td>${UI.esc(i.musteri_adi || '-')}${i.telefon ? `<br><small>${UI.esc(i.telefon)}</small>` : ''}</td>
                  <td>${UI.esc(i.urun_adi)}</td>
                  <td class="num">${i.adet}</td>
                  <td>${i.ilac_id ? (i.stokta_var ? `<span class="badge ok">Stokta (${i.stok})</span>` : `<span class="badge muted">${i.stok}</span>`) : '<span class="badge muted">Katalogda yok</span>'}</td>
                  <td>${DURUM[i.durum]}</td>
                  <td>${UI.esc(i.notlar || '')}</td>
                  <td class="actions-col">${
                    ['bekliyor', 'haber_verildi'].includes(i.durum)
                      ? `${i.musteri_id ? `<button class="secondary" data-haber="${i.id}">SMS ile haber ver</button>` : ''}
                         ${i.durum === 'bekliyor' && !i.musteri_id ? `<button class="secondary" data-durum="haber_verildi" data-id="${i.id}">Arandı</button>` : ''}
                         <button data-durum="teslim_edildi" data-id="${i.id}">Teslim edildi</button>
                         <button class="secondary" data-durum="iptal" data-id="${i.id}">İptal</button>`
                      : ''
                  }</td>
                </tr>`
              )
              .join('')
          : '<tr><td colspan="8" class="empty-state">Kayıt yok</td></tr>';
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          await Api.post('/api/istekler', {
            musteri_id: Number(fd.get('musteri_id')) || null,
            musteri_adi: fd.get('musteri_adi') || null,
            telefon: fd.get('telefon') || null,
            ilac_id: Number(fd.get('ilac_id')) || null,
            urun_adi: fd.get('urun_adi') || null,
            adet: Number(fd.get('adet')) || 1,
            notlar: fd.get('notlar') || null
          });
          UI.toast('İstek kaydedildi', 'success');
          form.reset();
          kayitsizGuncelle();
          yenile();
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      document.getElementById('ist-filtre').addEventListener('change', yenile);
      container.addEventListener('click', async (e) => {
        const haber = e.target.closest('[data-haber]');
        const durum = e.target.closest('[data-durum]');
        try {
          if (haber) {
            const r = await Api.post(`/api/istekler/${haber.dataset.haber}/haber-ver`, { kanal: 'sms' });
            UI.toast(`Müşteriye haber verildi${r.bildirim.durum === 'simule' ? ' (simüle)' : ''}`, 'success');
            yenile();
          } else if (durum) {
            await Api.put(`/api/istekler/${durum.dataset.id}/durum`, { durum: durum.dataset.durum });
            yenile();
          }
        } catch (err) {
          UI.toast(err.message, 'error');
        }
      });
      await yenile();
    }
  };

  Views.istekler = view;
})();
